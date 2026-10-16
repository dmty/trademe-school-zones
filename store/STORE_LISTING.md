# Chrome Web Store submission — School Zones for Trade Me

Upload: `dist/school-zones-for-trademe-<version>.zip`

## Store listing tab

**Name** (from manifest): School Zones for Trade Me

**Summary** (from manifest, ≤132 chars):
Draw NZ school enrolment zone boundaries on the Trade Me property map. Search a school, see its zone.

**Description:**
```
See school enrolment zones right on the Trade Me property map while you browse listings.

• Search any zoned New Zealand school by name and draw its enrolment zone on the map
• "Zones at map centre" — list every school zone covering the spot you're looking at
• Show several zones at once, each in its own colour; toggle, zoom to, or remove each one
• Your selected schools are remembered between visits

How to use: open a Trade Me property search, switch to Map view, and click "School zones"
(bottom-right) or the extension's toolbar icon.

Data: school enrolment zone boundaries are published by the New Zealand Ministry of Education
(CC BY) and served via Eagle Technology's ArcGIS Online service. Boundaries are simplified for
web display and may lag official changes — always confirm zoning with the school before making
decisions.

This extension is independent and is not affiliated with, endorsed by, or sponsored by Trade Me
Limited or the Ministry of Education.

Privacy: no personal data is collected; selections are stored locally in your browser.
```

**Category:** Tools (alt: Productivity)
**Language:** English (New Zealand) — or English
**Store icon:** `store/store-icon-128.png`
**Screenshots (640×400):** `store/screenshot-1-zones.png`, `store/screenshot-2-zones-at-centre.png`
**Small promo tile (440×280):** `store/promo-small-440x280.png`
**Homepage URL:** https://github.com/dmty/trademe-school-zones
**Support URL:** https://github.com/dmty/trademe-school-zones/issues

## Privacy tab

**Single purpose:**
```
Overlays New Zealand school enrolment zone boundaries on the Trade Me property search map so users can see which properties fall inside a school's zone.
```

**Permission justifications:**
- `storage`:
  ```
  Saves the user's selected schools and caches the public list of school names locally so the overlay persists between visits. No data leaves the device.
  ```
- Host permission `https://services.arcgis.com/*`:
  ```
  Fetches public school enrolment zone boundaries (Ministry of Education data) from an ArcGIS Online feature service. Requests are made from the service worker because the Trade Me page's Content Security Policy blocks them.
  ```
- Content script on `https://www.trademe.co.nz/*` (shown as host permission):
  ```
  Draws the zone boundaries onto the Trade Me property map and shows the school search panel. The script only adds an overlay layer; it does not read or transmit page content.
  ```

**Remote code:** No, I am not using remote code. (Only JSON/GeoJSON data is fetched; all JS is in the package.)

**Data usage:** tick nothing. Certify all three disclosures (not sold, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy URL:** https://github.com/dmty/trademe-school-zones/blob/main/store/PRIVACY.md
Not strictly required when no user data is collected, but the map-centre lookup sends coordinates to a
third party, so having one avoids review back-and-forth.

## Distribution tab

- **Visibility:** Unlisted (anyone with the link can install; not searchable) — or Public.
- **Regions:** New Zealand only is sensible, or all regions.
- **Pricing:** Free.

## Review risks

- **Trademark in name.** "for Trade Me" is the accepted pattern for third-party add-ons, and the
  description carries a non-affiliation disclaimer. If review flags it, rename to e.g. "NZ School Zones
  Map Overlay" and drop the brand from the name.
- **Screenshots show trademe.co.nz.** Normal for site-specific extensions.
