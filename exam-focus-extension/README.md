# ⚔️ Study Slash

> **A distraction-free CBT practice environment for Marks App and offline DPP PDFs, with answer masking, session analytics, and a cultivation progression system.**

![Version](https://img.shields.io/badge/version-1.1.1-14b8a6?style=for-the-badge)
![Manifest](https://img.shields.io/badge/Manifest-V3-06b6d4?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge%20%7C%20Brave-38bdf8?style=for-the-badge)
![Privacy](https://img.shields.io/badge/Data-Local%20First-10b981?style=for-the-badge)

---

## 📖 Table of Contents

1. [The Philosophy: Why Study Slash?](#-the-philosophy-why-study-slash)
2. [Core Feature Breakdown](#-core-feature-breakdown)
   - [Marks Site Arena](#1-marks-site-arena-live-cbt-on-webgetmarksapp)
   - [DPP PDF Arena](#2-dpp-pdf-arena-offline-split-screen-cbt)
   - [Arena Gateway Hub](#3-the-arena-gateway-hub)
   - [Hall of Cultivation](#4-the-hall-of-cultivation-gamified-mastery-engine)
   - [Autopsy Room](#5-the-autopsy-room-post-exam-analytics)
   - [Focus Shield](#6-focus-shield-distraction-blocking)
   - [Concept Review Discipline Gate](#7-concept-review-discipline-gate)
3. [Architecture & Technical Highlights](#-architecture--technical-highlights)
4. [Installation & Setup](#-installation--setup)
5. [Usage Workflow](#-usage-workflow)
6. [Changelog](#-changelog-v111)
7. [Privacy & Permissions](#-privacy--permissions)

---

## 🎯 The Philosophy: Why Study Slash?

Practice platforms can reveal correctness, community statistics, hints, or explanations immediately after an answer. That feedback can encourage guessing and make practice feel different from a timed computer-based test, where answers are reviewed after the session.

**Study Slash** adds a focused exam workflow to supported Marks pages and local PDF practice. It masks answer feedback during active Marks sessions, tracks time spent per question, and keeps session history on the device.

- **Mask immediate feedback:** Solution explanations, result indicators, and selected community content stay hidden during an active Marks session.
- **Practice exam discipline:** Use a session timer, question dwell times, review markers, and a question palette.
- **Build consistent habits:** Track progress through the cultivation levels using recorded practice, accuracy, and negative-marking outcomes.

## 🚀 Core Feature Breakdown

### 1. Marks Site Arena (Live CBT on `web.getmarks.app`)

The Marks content script adds session controls to supported Marks pages:

- **Floating cultivation launcher:** A compact badge opens session setup and displays cultivation progress. It can be moved around the page and expands to show additional session details.
- **In-exam focus HUD:** Shows elapsed or remaining time, current question, per-question dwell time, and session progress.
- **Question palette:** Tracks attempted/answered, review, and unattempted questions.
- **Question formats:** Tracks single-choice, multiple-choice, and numerical responses, including Marks numerical evaluation attributes.
- **Answer masking:** Hides supported solution, answer, and community feedback elements while a session is active. Results are available after the session.

### 2. DPP PDF Arena (Offline Split-Screen CBT)

The dashboard includes an in-browser PDF test workspace for DPP sheets and other practice papers:

- **PDF reader and answer console:** View a PDF alongside a question palette and answer controls.
- **Answer-key input:** Provide or parse an answer key for grading. The key is kept out of the active answering flow and used when grading the submitted test; this is an application-level workflow, not cryptographic storage.
- **Scoring and review:** Submit to calculate results and review the session, including question-level time and answer information.
- **Local PDF storage:** Session records and associated PDF data use local browser storage, including IndexedDB for PDF data.

PDF parsing quality depends on the document layout and whether its text is extractable. Scanned PDFs may require a separately supplied answer key or may not parse as expected.

### 3. The Arena Gateway Hub

The **⚔️ Arena** control in the dashboard top bar opens a launch hub with links to:

- **Marks Site Arena:** Opens `https://web.getmarks.app`.
- **DPP PDF Arena:** Opens the offline PDF test workspace.

### 4. The Hall of Cultivation (Gamified Mastery Engine)

Practice activity contributes to a progression system with **20 realms and 199 levels**. The dashboard shows cultivation level, experience, streak and accuracy information, and progression requirements. Animated SVG crests change with the current realm and tier.

The cultivation model also tracks debt associated with negative marking and progression conditions. Details are calculated from locally recorded session history.

### 5. The Autopsy Room (Post-Exam Analytics)

Completed session reports support review of:

- Question outcomes and attempted versus unattempted questions.
- Time spent on questions, including potential time sinks.
- Accuracy, marks, and session pacing metrics available from the recorded data.
- Missed-question reattempts and concept-review activity where supported by the session.

Available charts and report details depend on the session type and the data captured during practice.

### 6. Focus Shield (Distraction Blocking)

When enabled, Focus Shield uses Manifest V3 `declarativeNetRequest` rules to block configured distracting sites. A separate YouTube guard supports focus behavior on YouTube pages. Focus behavior is controlled by the extension’s settings and session state; it does not block every possible distraction or device-level application.

### 7. Concept Review Discipline Gate

A habit-reinforcement mechanic for concept reviews on Marks App:

- **Anti-spam time window:** A review qualifies only when its timer runs for at least **60 seconds** and no more than **270 seconds**. Faster reviews and reviews left idle beyond 4 minutes 30 seconds earn no XP.
- **Stealth half-XP accumulation:** Each qualified completion contributes 0.5 XP internally. Fractional XP is never shown in the HUD, popup, dashboard, or launcher.
- **Two-for-one integer progression:** The ledger floors the total to one visible XP for every two qualified reviews. One qualified review adds no visible XP; the second adds 1 XP.
- **History-derived progress:** Review completions are archived with session history. Clearing or replacing the archive also resets or replaces the qualified review count and its XP.

## 🛠️ Architecture & Technical Highlights

```text
Study Slash/
├── manifest.json                  # Manifest V3 metadata, permissions, and entry points
├── background.js                  # Session lifecycle, storage coordination, and focus rules
├── assets/                        # Study Slash logos, icons, and bundled sample PDF
├── content_scripts/
│   ├── marks_interceptor.js       # Marks integration, answer masking, HUD, and launcher
│   ├── focus_guard.js             # Focus-blocked page behavior
│   └── yt_focus_guard.js          # YouTube focus behavior
├── dashboard/
│   ├── dashboard.html             # Analytics dashboard and cultivation views
│   ├── dashboard.js               # Reports, charts, and cultivation progression
│   ├── dashboard.css              # Dashboard styling
│   ├── cultivation-visuals.js     # Shared SVG badge and animation renderer
│   ├── dpp_arena.html             # PDF CBT workspace
│   ├── dpp_arena.js               # PDF test workflow, grading, and review
│   └── dpp_arena.css              # PDF workspace styling
├── popup/                         # Toolbar popup and session controls
└── styles/
    └── blur.css                   # Marks masking and in-exam HUD styles
```

- **Manifest V3:** Uses a service worker, extension storage, and declarative network rules.
- **Event-driven page integration:** Delegated DOM events and mutation observers respond to question changes and evaluation state.
- **Defensive lifecycle handling:** Message sends resolve safely when extension contexts disconnect; the content script stops its active work on invalidation.
- **Local persistence:** Session and dashboard data are stored with `chrome.storage.local` and IndexedDB.

## 📦 Installation & Setup

### Load unpacked in Chrome, Edge, or Brave

1. Download or clone this repository to your computer.
2. Open the browser’s extensions page (`chrome://extensions`, `edge://extensions`, or `brave://extensions`).
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the repository root folder containing `manifest.json`.
5. Pin **Study Slash** from the extensions menu for toolbar access.

After installing an updated unpacked extension, reload it from the extensions page and refresh any open Marks tabs so they load the updated content script.

## 🎮 Usage Workflow

### Practicing on Marks App

1. Open a supported chapter or question set on [Marks App](https://web.getmarks.app).
2. Use the floating cultivation badge to configure and start a session.
3. Answer questions as usual. Use the HUD and question palette to track progress and mark questions for review.
4. Submit the session to end the focus workflow and review its available results.

### Practicing with PDFs

1. Open the Study Slash dashboard from the toolbar popup.
2. Select **⚔️ Arena**, then choose **DPP PDF Arena**.
3. Load a question paper PDF and provide or review the answer key.
4. Configure the session and enter answers in the CBT console.
5. Submit to grade and review the session.

## 📝 Changelog (v1.1.1)

- Rebranded the extension and its UI to **Study Slash**.
- Added the Arena Gateway Hub for opening Marks practice or the DPP PDF workspace.
- Improved numerical answer capture and explicit Marks outcome detection.
- Fixed mutually exclusive highlighting for single-choice answers.
- Added defensive handling for extension context invalidation.
- Improved cultivation badge drag cleanup, including pointer-capture loss and window blur.
- Added the Concept Review Discipline Gate with a 60–270 second dwell window and integer-only half-XP accumulation (1 XP per two qualified reviews).
- Made cultivation XP and levels history-derived, with clear-history returning progress to 0 XP and Level 0 (Uninitiated / Mortal).
- Changed backup import to replace archived records instead of stacking them.

## 🔒 Privacy & Permissions

Study Slash stores practice history, settings, and cultivation data locally in the browser using `chrome.storage.local` and IndexedDB. The extension does not include analytics or telemetry collection. The Marks integration operates on the supported Marks site, while the dashboard opens that site when requested.

The manifest requests these permissions:

- `storage`: Save local settings, session records, and progress.
- `tabs`, `activeTab`, and `webNavigation`: Open and coordinate practice pages and extension views.
- `scripting`: Support extension page and content workflows.
- `alarms`: Handle scheduled session timing.
- `unlimitedStorage`: Store larger local session and PDF records.
- `declarativeNetRequest` and `declarativeNetRequestFeedback`: Apply and manage focus-blocking rules.
- Host access (`<all_urls>`): Support site blocking and the general focus guard; the Marks-specific integration is limited to Marks pages.

No `LICENSE` file is currently included in the repository. Add a license file before redistributing the project under a specific license.

---

*Sharpen your focus. Build the habit. Conquer the exam.*
