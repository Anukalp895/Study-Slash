# Chrome Web Store Listing — Exam Arena

> Last Updated: 2026-09-26

## Store Listing

**Extension Name**
Exam Arena

**Short Description**
A focused exam environment with private practice analytics, offline PDF DPP Arena auto-grading, and masked answer feedback.

**Detailed Description**
Exam Arena helps competitive exam aspirants (JEE, NEET, etc.) build exam temperament and consistency. It blocks distracting websites during active practice, masks instant answer feedback on web test portals (like Marks) to simulate real CBT exams, and features DPP Arena: an offline PDF test simulator with auto-grading, question-by-question dwell time analytics, and autopsy reviews.

Key Features:
- DPP Arena: Drag-and-drop offline PDF test series and DPPs (Allen, PW, Aakash). Auto-extracts answer keys and metadata, provides a split-screen CBT question console, and records per-question dwell time.
- Answer Masking: Automatically blurs solution explanations and instant outcome indicators on Marks until the exam is finished.
- Tier 2 Autopsy Room: Detailed post-exam review with time-sink identification, calculated skips analysis, and dual-line pacing charts.
- Hall of Cultivation: Gamified progression system with 20 profound realms and sub-level ascension tied to real practice volume, accuracy, and negative bleed control.
- Standalone Reattempt Engine: Practice missed questions with dedicated timers and wound-healing antidotes.

Privacy by Design:
All exam responses, PDF files, and cultivation telemetry remain 100% local on your device. No telemetry, account tracking, or external database transmission.

**Category**
Productivity

**Single Purpose**
Simulates distraction-free competitive CBT exams and offline PDF practice with local auto-grading and private analytics.

**Primary Language**
English

## Permissions Justification

| Permission | Justification |
|------------|---------------|
| `storage` | Stores private practice session history, user preferences, and cultivation progression state locally on the user's browser. |
| `unlimitedStorage` | Allows local caching of offline DPP / test series PDF documents in IndexedDB and multi-month practice analytics without quota truncation. |
| `tabs` | Required to query and navigate tabs during an active exam, ensuring the student stays focused on their test domain. |
| `webNavigation` | Detects when a student attempts to navigate away from an active test session to redirect them back to the exam. |
| `activeTab` | Grants temporary interactive access to the active exam tab for injecting focus controls. |
| `scripting` | Injects feedback-masking stylesheets and reattempt HUD overlays into authorized exam tabs. |
| `alarms` | Drives the exam deadline countdown timer reliably in background service workers. |

## Host Permissions Justification

| Host Pattern | Justification |
|--------------|---------------|
| `*://*.getmarks.app/*` | Allows masking answer indicators and tracking CBT interactions during practice on Marks. |
| `*://*.youtube.com/*` | Enforces focus guard mode to block video distraction loops during timed exam sessions. |

## Version History

- **v1.1.0** (2026-09-26): Introduced DPP Arena — in-browser PDF exam mode with auto-grading, split-screen CBT console, dwell tracking, and direct autopsy solution jump. Added `unlimitedStorage` permission.
- **v1.0.0** (2026-09-24): Initial release with Focus Guard, answer masking on Marks, Tier 2 Autopsy Room, and Hall of Cultivation.
