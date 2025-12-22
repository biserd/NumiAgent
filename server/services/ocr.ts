import { ai } from "../replit_integrations/image/client";

export interface CoinOCRResult {
  obvLegend: string | null;
  revLegend: string | null;
  denomination: string | null;
  ruler: string | null;
  mint: string | null;
  dateEstimate: string | null;
  metal: string | null;
  confidence: number;
  rawAnalysis: string;
}

/**
 * Analyze a coin image using Gemini to extract legends and metadata.
 * @param imageBase64 - Base64 encoded image data (without data URL prefix)
 * @param mimeType - Image MIME type (e.g., 'image/jpeg', 'image/png')
 * @param side - 'obverse', 'reverse', or 'both' (if single image shows both sides)
 */
export async function analyzeCoinImage(
  imageBase64: string,
  mimeType: string = 'image/jpeg',
  side: 'obverse' | 'reverse' | 'both' = 'both'
): Promise<CoinOCRResult> {
  const prompt = `You are an expert numismatist analyzing an ancient coin image. 
This is the ${side === 'both' ? 'obverse and reverse' : side} of the coin.

Please analyze this coin image and extract the following information:

1. OBVERSE LEGEND: The text/inscription visible on the obverse (front) side. Use standard epigraphic conventions (dots for separators, square brackets for uncertain letters).
2. REVERSE LEGEND: The text/inscription visible on the reverse (back) side.
3. DENOMINATION: The coin type (e.g., denarius, sestertius, tetradrachm, drachm, as, solidus).
4. RULER: The emperor, king, or issuing authority.
5. MINT: The mint city if identifiable from symbols or marks.
6. DATE ESTIMATE: Approximate date range in years (e.g., "27 BCE - 14 CE" or "138-161 CE").
7. METAL: The material (gold, silver, bronze, copper, billon, electrum).

Respond in JSON format with these exact keys:
{
  "obvLegend": "legend text or null",
  "revLegend": "legend text or null",
  "denomination": "coin type or null",
  "ruler": "issuing authority or null",
  "mint": "mint city or null",
  "dateEstimate": "date range or null",
  "metal": "material or null",
  "confidence": 0.0-1.0,
  "notes": "any additional observations"
}

If you cannot determine a field, set it to null. The confidence score should reflect your overall certainty about the identification.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: imageBase64,
                mimeType: mimeType,
              },
            },
            { text: prompt },
          ],
        },
      ],
    });

    // Extract text from response - the SDK uses a getter property
    const text = response.text ?? '';
    
    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        obvLegend: null,
        revLegend: null,
        denomination: null,
        ruler: null,
        mint: null,
        dateEstimate: null,
        metal: null,
        confidence: 0,
        rawAnalysis: text,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      obvLegend: parsed.obvLegend || null,
      revLegend: parsed.revLegend || null,
      denomination: parsed.denomination || null,
      ruler: parsed.ruler || null,
      mint: parsed.mint || null,
      dateEstimate: parsed.dateEstimate || null,
      metal: parsed.metal || null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      rawAnalysis: text,
    };
  } catch (error) {
    console.error("OCR analysis error:", error);
    throw new Error(`Failed to analyze coin image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Analyze both obverse and reverse images together for better context.
 */
export async function analyzeCoinPair(
  obverseBase64: string,
  reverseBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<CoinOCRResult> {
  const prompt = `You are an expert numismatist analyzing an ancient coin. I'm providing two images:
1. The OBVERSE (front) of the coin
2. The REVERSE (back) of the coin

Please analyze both images together and extract the following information:

1. OBVERSE LEGEND: The text/inscription on the obverse. Use standard epigraphic conventions.
2. REVERSE LEGEND: The text/inscription on the reverse.
3. DENOMINATION: The coin type (e.g., denarius, sestertius, tetradrachm).
4. RULER: The emperor, king, or issuing authority.
5. MINT: The mint city if identifiable.
6. DATE ESTIMATE: Approximate date range.
7. METAL: The material (gold, silver, bronze, etc.).

Respond in JSON format:
{
  "obvLegend": "legend text or null",
  "revLegend": "legend text or null",
  "denomination": "coin type or null",
  "ruler": "issuing authority or null",
  "mint": "mint city or null",
  "dateEstimate": "date range or null",
  "metal": "material or null",
  "confidence": 0.0-1.0,
  "notes": "additional observations"
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: "OBVERSE IMAGE:" },
            {
              inlineData: {
                data: obverseBase64,
                mimeType: mimeType,
              },
            },
            { text: "REVERSE IMAGE:" },
            {
              inlineData: {
                data: reverseBase64,
                mimeType: mimeType,
              },
            },
            { text: prompt },
          ],
        },
      ],
    });

    // Extract text from response - the SDK uses a getter property
    const text = response.text ?? '';
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        obvLegend: null,
        revLegend: null,
        denomination: null,
        ruler: null,
        mint: null,
        dateEstimate: null,
        metal: null,
        confidence: 0,
        rawAnalysis: text,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      obvLegend: parsed.obvLegend || null,
      revLegend: parsed.revLegend || null,
      denomination: parsed.denomination || null,
      ruler: parsed.ruler || null,
      mint: parsed.mint || null,
      dateEstimate: parsed.dateEstimate || null,
      metal: parsed.metal || null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      rawAnalysis: text,
    };
  } catch (error) {
    console.error("OCR pair analysis error:", error);
    throw new Error(`Failed to analyze coin images: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
