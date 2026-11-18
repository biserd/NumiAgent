"""Read only selected entries from public image archives, with content checks."""

import hashlib
import io
import re
import struct
import time
import urllib.error
import urllib.request
import zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageOps

JAAL_ARCHIVE = "https://data.mendeley.com/public-files/datasets/2m7wk5cy4c/files/27e6e73f-407a-42ea-966c-1d669a3a41d9/file_downloaded"
JAAL_SIZE = 7_583_926_764


def get(url, byte_range=None):
    headers = {"User-Agent": "NumiAgent-model-evaluation/1.0 (public research dataset sample)"}
    if byte_range:
        start, end = byte_range
        headers["Range"] = f"bytes={start}-{end}"
    request = urllib.request.Request(url, headers=headers)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                if byte_range:
                    expected = f"bytes {start}-{end}/"
                    if response.status != 206 or not response.headers.get("Content-Range", "").startswith(expected):
                        raise ValueError(f"Unexpected range response for {expected}")
                data = response.read(20_000_000)
                if byte_range and len(data) != end - start + 1:
                    raise ValueError("Truncated range response")
                return data
        except (TimeoutError, OSError):
            if attempt == 2:
                raise
            time.sleep(1 + attempt * 2)


def archive_index():
    # The publisher's pinned ZIP64 archive has a central directory under 1.5 MB.
    tail = get(JAAL_ARCHIVE, (JAAL_SIZE - 1_500_000, JAAL_SIZE - 1))
    entries = {}
    pattern = rb"real_notes/note_\d{3,4}/note_\d{3,4}_[1-6]\.jpg"
    for match in re.finditer(b"PK\x01\x02", tail):
        index = match.start()
        header = struct.unpack_from("<4s6H3I5H2I", tail, index)
        name_end = index + 46 + header[10]
        name = tail[index + 46:name_end]
        if not re.fullmatch(pattern, name):
            continue
        size, raw_size, offset = header[8], header[9], header[16]
        if any(v == 0xFFFFFFFF for v in (raw_size, size, offset)):
            extra = tail[name_end:name_end + header[11]]
            tag, length = struct.unpack_from("<HH", extra)
            if tag != 1:
                raise ValueError("Expected ZIP64 metadata")
            values = iter(struct.unpack_from("<" + "Q" * (length // 8), extra, 4))
            raw_size, size, offset = (next(values) if value == 0xFFFFFFFF else value
                                      for value in (raw_size, size, offset))
        entries[name.decode()] = (offset, size, raw_size, header[4], header[7])
    if len(entries) != 802 * 6:
        raise ValueError(f"Expected six views of all 802 genuine notes, got {len(entries)} images")
    return entries


def from_archive(source):
    offset, size, raw_size, codec, crc = source["entry"]
    data = get(JAAL_ARCHIVE, (offset, offset + size + 511))
    header = struct.unpack_from("<4s5H3I2H", data)
    if header[0] != b"PK\x03\x04":
        raise ValueError("Invalid ZIP local header")
    start = 30 + header[-2] + header[-1]
    compressed = data[start:start + size]
    raw = zlib.decompress(compressed, -15) if codec == 8 else compressed
    if len(raw) != raw_size or zlib.crc32(raw) != crc:
        raise ValueError("ZIP entry checksum mismatch")
    return raw


def save_photo(source, destination):
    raw = from_archive(source) if "entry" in source else get(source["url"])
    if source.get("sha256") and hashlib.sha256(raw).hexdigest() != source["sha256"]:
        raise ValueError("Source image changed")
    with Image.open(io.BytesIO(raw)) as original:
        image = ImageOps.exif_transpose(original).convert("RGB")
        image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
        image.save(destination, format="JPEG", quality=90)
    return hashlib.sha256(raw).hexdigest()


def download_all(work, workers=5):
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(lambda job: save_photo(*job), work))
