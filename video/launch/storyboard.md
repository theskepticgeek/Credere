# Credere — The ascent of earned credit

40 seconds · 1920 × 1080 · 60 fps · synthesized stereo soundtrack · 120 BPM · D minor.

| Timecode | On-screen headline (≤7 words) | Visual | Motion technique | Transition out | Sound cue |
|---|---|---|---|---|---|
| 00:00–00:03 | Can history earn credit? | Giant editorial type above a drawn Himalayan ridgeline; orange climbing route begins. | Staggered kinetic typography with overshoot and echo outlines. | Vertical slit opens onto the problem. | Low pulse, letter plucks, rising noise, slit whoosh. |
| 00:03–00:08 | Reputation → borrowing rate / Underwriting is next. | Repayment tiles climb toward an incomplete bridge; the missing span makes residual risk visible. These phrases come from the Research screen. | Tile/grid rhythm, staggered back easing, constrained particles. | Circular iris through the unfinished bridge. | Building hats and bass, tile pops, ascending riser. |
| 00:08–00:12 | Credere. / Credit, earned onchain. | Huge wordmark lands over an orange sun and abstract summit. | Pseudo-3D summit layers, elastic wordmark impact, shockwave rings. | Diagonal orange wipe. | Deep impact and D-minor chord; short drop before reveal. |
| 00:12–00:18 | Repay. Build trust. | Two repayment blocks lock into an ascending route; an earned-credit node lights up. | Shape morphing: blocks become route nodes and a completed mountain path. | Match cut from earned-credit node to cap dial. | Two warm landing pops, plucked route notes, beat peak. |
| 00:18–00:24 | Bounded by design. | Four moving rails converge into one capped credit dial; 200 USDC maximum is a policy ceiling, not a demonstrated borrower balance. | Deterministic particle paths, overshooting rails, number count. | Zoom through the dial into a borrowing panel. | Four synchronized blips, cap impact, zoom whoosh. |
| 00:24–00:30 | Borrow on your terms. | Simplified vector UI: 1,000 USDC principal, 975 collateral, 10% APR. Labels identify this as a local demonstration. | Staggered UI cards, back easing, controlled perspective shear. | Horizontal slit wipe. | Card plucks, soft confirmation impact, transition riser. |
| 00:30–00:35 | Risk has a place to go. | The observed default flows from 975 collateral to 25 reserve to 0 LP loss, on a 1,000 USDC loan. | Cascading vector waterfall and counting values. | Mountain-shaped match wipe. | Descending taps, reserve bass hit, resolution pickup. |
| 00:35–00:40 | Credere. / Credit, earned onchain. / Credere | Name, value proposition, requested destination label, and “Test funds only” resolve over a still summit. Final composition holds from 00:37 through 00:40. | Expo landing; all composition motion then stops. Subtle grain remains. | Hold to final frame. | Resolved D-minor/add9 chord, sub pulse, long clean tail. |

## Research and claim boundaries

- Product: **Credere**, “Credit, earned onchain.” The local application and README define a test-token lending and research prototype where successful on-time repayment earns bounded unsecured capacity.
- Audience: prototype borrowers building repayment history, liquidity providers inspecting pool accounting, and hackathon reviewers. No customer counts, speed claims, testimonials, sponsor logos, or commercial prices are asserted.
- Four featured capabilities: repayment-based history; four independently bounded credit limits; transparent fixed-policy borrowing terms; collateral → first-loss reserve → explicit LP impairment accounting.
- Exact policy numbers: 200 USDC global unsecured ceiling; four tiers. Fixed policy APRs are 12%, 10%, 9%, and 8%; these are experimental settings, not dynamically calibrated risk prices. No pricing or separate About/Features page exists in the local application.
- Film demo values: 1,000 principal / 975 collateral / 10% APR / 25 reserve used / 0 LP principal loss, from `video/demo-evidence.json`, corroborated by `artifacts/local-demo.json`. The zero LP loss is one observed local-chain default, not a promise that the pool cannot lose money.
- Shared conversation: https://chatgpt.com/share/6acbd071-4788-83ee-8ee8-05be4d267eb0 — reviewed via its embedded conversation payload. It develops the research-continuation thesis: earned credit, bounded exposure, residual loss accounting. Implemented application claims take precedence over earlier proposals about predictive models, external credentials or ZK.
- Hackathon: https://hackinhills.com/ — its mountain ascent, contour lines, editorial type, paper/charcoal contrast and orange route markers inform the art direction. This film does not imply affiliation or sponsorship.
- Hackathon stylesheet: https://hackinhills.com/_next/static/immutable/chunks/0f2f1s69dzqaw.css
- Six-color base: charcoal **#1A1A1A**, paper **#F4F1EA**, orange **#FF512F**, alpine blue **#33556F**, ice **#BDE0FE**, stone **#E6E1D6**. Two Credere accents from `src/styles.css`: forest **#244C3A**, lime **#E5EDC3**.
- Exact free fonts: Anton (display), Syne (wordmark), Manrope (body), JetBrains Mono (technical labels), all Google Fonts / SIL Open Font License. Fonts are embedded in the final HTML for offline playback.
- Product destination supplied by the user is the label **Credere**; no public product URL was provided, and hosting is local. The end card uses that label without inventing a domain.

## Deliverables

`credere-launch.mp4`: H.264 High / yuv420p / CRF 16 / AAC 256 kb/s / faststart.

`credere-launch.html`: one self-contained HTML, one canvas, embedded fonts, deterministic `render(t)`, shared `TIMELINE`, OfflineAudioContext sound, play/pause, scrubber, timecode, sound toggle. Open in Chromium; press Play to generate the soundtrack on first interaction.

`render.mjs`: reproducible Playwright → PNG pipe → FFmpeg renderer. `qa.json` and `contact-sheet.jpg` record export QA.

## Final export verification

- MP4 duration: exactly 40.000 seconds; 2,400 frames; 1920 × 1080 at 60 fps.
- H.264 High profile, yuv420p, CRF 16; stereo 48 kHz AAC at requested 256 kb/s; faststart atom order verified.
- Decoded audio peak: **−1.52 dBFS**, with **zero clipped samples**. FFmpeg `volumedetect` reports −1.5 dBFS.
- Ten final MP4 frames inspected in `contact-sheet.jpg` for clipping, overlap, contrast, font rendering and palette. All four embedded fonts load successfully.
- Text-bound audit passes at 400 points across the timeline: minimum 60 px type and 90 px frame-safe margin.
- Re-rendering a frame after seeking to an unrelated time produces an identical PNG hash.
- Playback, pause, scrub and sound-toggle checks pass; visual time follows the preview audio clock.
- Final end-card composition is still from 37 seconds to the end, with only subtle grain changing.

To rebuild on this workspace: `python video/launch/build-source.py`, `node video/launch/render.mjs`, then `python video/launch/verify-export.py`. The renderer accepts `CHROMIUM_PATH`, `FFMPEG_PATH`, `FFPROBE_PATH` and `CODEX_NODE_MODULES` overrides for other environments.
