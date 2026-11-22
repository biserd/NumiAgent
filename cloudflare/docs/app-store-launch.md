# App Store launch

The public site links to the live [NumiAgent App Store listing](https://apps.apple.com/app/id6835208218) and the separate [web catalog](https://numiagent.com/app). Existing launch email confirmation and unsubscribe links still work.

## Switch the call to action

Verify the [public Apple listing](https://apps.apple.com/app/id6835208218) in a supported territory before changing the site. Set `NUMIS_APP_STORE_AVAILABLE=true` for the production deployment. For a direct Wrangler deployment, set the Worker variable `APP_STORE_AVAILABLE` to `"true"`. Deploy and verify that the homepage and the three product pages link to the public listing. The waitlist form is hidden in this state. Existing confirmation and unsubscribe links remain usable.

The native images in `public/launch-media` are resized captures from [the iOS checks for the submitted build](https://github.com/biserd/NumiAgent/actions/runs/44959470018). The silent video is edited from the signed-in web app using U.S. Mint photos of a sample Jefferson nickel. Use the original iPhone and iPad captures at their native dimensions when preparing listing screenshots. The website video uses the web app and is intended for the website.

## Launch email

Cloudflare Email Service sends the transactional confirmation. Keep the one-time launch announcement in a marketing email service that supports unsubscribe and suppression. Cloudflare documents [transactional-only sending](https://developers.cloudflare.com/email-service/reference/faq/).

Export only confirmed and unexpired rows from the production D1 binding at send time. For example, an authorized operator can run the following command in the Cloudflare directory. Keep the resulting recipient file outside the repository and review suppressions before sending.

```sh
npx wrangler d1 execute DB --remote --config wrangler.deploy.json --json --command "SELECT email, confirmed_at FROM launch_waitlist WHERE confirmed_at > unixepoch() - 31536000 ORDER BY confirmed_at"
```

**Subject** NumiAgent is available on iPhone and iPad

**Body** You asked to hear when NumiAgent launched. It’s now available on the App Store. Photograph both sides of a coin or banknote, review what the app finds, and keep a searchable collection on your device. [Download NumiAgent](https://apps.apple.com/app/id6835208218) or [open the web catalog](https://numiagent.com/app).

Include the sending service’s unsubscribe link. Use these subscribers for this announcement only.

## Analytics

The public site sends `launch_signup` after the request succeeds, `app_store_click` on a store link click, and `web_catalog_click` on the main web catalog links. Each event requires analytics consent and carries the public page path without its query or fragment. `launch_signup` measures requests. D1 measures confirmed subscriptions. The confirmation and unsubscribe page has no analytics.
