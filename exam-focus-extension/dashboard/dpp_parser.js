/**
 * DPP Parser - Text & Metadata Extraction Engine for DPP Arena
 * Parses offline test series / DPP PDFs (Allen, PW, Aakash, etc.)
 * Extracts subject, topic, date, total marks, answer keys, and solution page mappings.
 */
(() => {
  'use strict';

  /**
   * Extract plain text and metadata from all pages using pdfjsLib
   * @param {object} pdfDoc - PDFDocumentProxy from pdfjsLib
   * @param {function} onProgress - Optional callback(current, total)
   * @returns {Promise<Array<{pageNumber: number, text: string}>>}
   */
  async function extractPagesText(pdfDoc, onProgress = null) {
    const pages = [];
    const total = pdfDoc.numPages;
    for (let i = 1; i <= total; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str).join(' ');
      pages.push({ pageNumber: i, text });
      if (typeof onProgress === 'function') {
        onProgress(i, total);
      }
    }
    return pages;
  }

  /**
   * Parse exam metadata from pages text
   * @param {Array<{pageNumber: number, text: string}>} pages
   * @returns {{subject: string, topic: string, totalMarks: number|null, date: string, paperSet: string, suggestedTitle: string}}
   */
  function parseMetadata(pages) {
    let subject = '';
    let topic = '';
    let totalMarks = null;
    let date = '';
    let paperSet = '';

    for (const p of pages) {
      const text = p.text;

      // Subject
      if (!subject) {
        const subjMatch = text.match(/Subject\s*:\s*([A-Za-z\s]+?)(?=\s+(?:Standard|Total|Paper|Date|Time|$|\n))/i);
        if (subjMatch) subject = subjMatch[1].trim();
      }

      // Total Marks
      if (!totalMarks) {
        const marksMatch = text.match(/Total\s*Mark(?:s)?\s*:\s*(\d+)/i);
        if (marksMatch) totalMarks = parseInt(marksMatch[1], 10);
      }

      // Date
      if (!date) {
        const dateMatch = text.match(/Date\s*:\s*([\d\-/]+)/i);
        if (dateMatch) date = dateMatch[1].trim();
      }

      // Paper Set
      if (!paperSet) {
        const setMatch = text.match(/Paper\s*Set\s*:\s*(\d+)/i);
        if (setMatch) paperSet = setMatch[1].trim();
      }

      // Topic: often placed after Total Mark or at top before Section/Answer Key
      if (!topic) {
        const topicMatch = text.match(/(?:Total Mark\s*:\s*\d+\s+)([A-Za-z0-9\s_-]+?)(?=\s*(?:\(Answer Key\)|\(Solutions\)|\. \. \. \.|\n|Paper Set|Physics|Chemistry|Mathematics|Biology))/i);
        if (topicMatch) {
          const cand = topicMatch[1].trim();
          if (cand.length > 1 && cand.length < 50 && !/^(dpp|paper|standard)/i.test(cand)) {
            topic = cand;
          }
        }
      }
    }

    // Default fallbacks
    if (!subject) subject = 'Physics';
    if (!topic) topic = 'Practice DPP';

    const suggestedTitle = `DPP - ${topic} (${subject}${paperSet ? ` Set ${paperSet}` : ''})`;

    return {
      subject,
      topic,
      totalMarks,
      date,
      paperSet,
      suggestedTitle
    };
  }

  /**
   * Parse answer key from pages
   * Searches for explicit (Answer Key) sections first, then falls back to global scan
   * @param {Array<{pageNumber: number, text: string}>} pages
   * @returns {{answerKey: Object<string, string>, totalQuestions: number, keyPageNumber: number|null}}
   */
  function parseAnswerKey(pages) {
    const answerKey = {};
    let keyPageNumber = null;

    // Pattern for matching: "1 - B", "1. B", "1: B", "1) B", "1 B"
    const akRegex = /(?:^|\s|\b)(\d{1,3})\s*[-:.)]\s*([A-D])(?:\b|\s|$)/gi;

    // Priority 1: Check pages that explicitly mention "Answer Key"
    for (const p of pages) {
      if (/answer\s*key/i.test(p.text)) {
        const matches = [...p.text.matchAll(akRegex)];
        if (matches.length >= 3) {
          keyPageNumber = p.pageNumber;
          for (const m of matches) {
            const qNum = String(parseInt(m[1], 10));
            answerKey[qNum] = m[2].toUpperCase();
          }
          break;
        }
      }
    }

    // Priority 2: If not found, scan all pages before solutions
    if (Object.keys(answerKey).length === 0) {
      for (const p of pages) {
        if (/solutions?/i.test(p.text)) break; // stop at solutions
        const matches = [...p.text.matchAll(akRegex)];
        if (matches.length >= 5) {
          keyPageNumber = p.pageNumber;
          for (const m of matches) {
            const qNum = String(parseInt(m[1], 10));
            answerKey[qNum] = m[2].toUpperCase();
          }
          if (Object.keys(answerKey).length >= 10) break;
        }
      }
    }

    // Priority 3: Fallback - look for Solution lines: "Solution:(Correct Answer:D)" or "Correct Option: C"
    if (Object.keys(answerKey).length === 0) {
      for (const p of pages) {
        const solMatches = [...p.text.matchAll(/(?:\((\d{1,3})\)[\s\S]*?)?(?:Correct\s*(?:Answer|Option)\s*[:=]\s*([A-D]))/gi)];
        for (const m of solMatches) {
          if (m[1] && m[2]) {
            const qNum = String(parseInt(m[1], 10));
            answerKey[qNum] = m[2].toUpperCase();
          }
        }
      }
    }

    const totalQuestions = Object.keys(answerKey).length;
    return {
      answerKey,
      totalQuestions,
      keyPageNumber
    };
  }

  /**
   * Parse user manually entered or pasted answer key text
   * Handles:
   * "1-B, 2-B, 3-D..."
   * "1. B \n 2. C..."
   * "B B D C A A D C..." (sequential letters without numbers)
   * @param {string} rawText
   * @param {number} fallbackCount - if sequential letters are given
   * @returns {Object<string, string>}
   */
  function parseRawAnswerKeyText(rawText, fallbackCount = 25) {
    if (!rawText || typeof rawText !== 'string') return {};
    const key = {};
    const text = rawText.trim();

    // Try numbered pairs first: "1-A", "1: B", "1. C", "1) D"
    const pairRegex = /(?:^|\s|\b)(\d{1,3})\s*[-:.)]\s*([A-D])(?:\b|\s|$)/gi;
    const matches = [...text.matchAll(pairRegex)];

    if (matches.length > 0) {
      for (const m of matches) {
        const qNum = String(parseInt(m[1], 10));
        key[qNum] = m[2].toUpperCase();
      }
      return key;
    }

    // Secondary attempt: "Q1 A", "Q.1 B"
    const qPairRegex = /Q(?:uestion)?\.?\s*(\d{1,3})\s*[:\s-]\s*([A-D])/gi;
    const qMatches = [...text.matchAll(qPairRegex)];
    if (qMatches.length > 0) {
      for (const m of qMatches) {
        const qNum = String(parseInt(m[1], 10));
        key[qNum] = m[2].toUpperCase();
      }
      return key;
    }

    // Tertiary attempt: comma or whitespace separated letters: "B, B, D, C, A..." or "B B D C A"
    const letters = text.match(/\b([A-D])\b/gi);
    if (letters && letters.length > 0) {
      letters.forEach((letter, idx) => {
        key[String(idx + 1)] = letter.toUpperCase();
      });
      return key;
    }

    return key;
  }

  /**
   * Detect solution pages and map question numbers to pages
   * @param {Array<{pageNumber: number, text: string}>} pages
   * @param {number} totalQuestions
   * @returns {{firstSolutionPage: number|null, solutionPages: Object<string, number>}}
   */
  function detectSolutionPages(pages, totalQuestions = 0) {
    let firstSolutionPage = null;
    const solutionPages = {};

    for (const p of pages) {
      if (/solutions?/i.test(p.text) && !firstSolutionPage) {
        firstSolutionPage = p.pageNumber;
      }
      if (firstSolutionPage && p.pageNumber >= firstSolutionPage) {
        // Find question markers like (1), (2), (17) or "Question 17" or "Q17"
        const qMatches = [...p.text.matchAll(/(?:\((\d{1,3})\)|(?:Question|Q\.?)\s*(\d{1,3}))/gi)];
        for (const m of qMatches) {
          const qNum = String(parseInt(m[1] || m[2], 10));
          if (!solutionPages[qNum]) {
            solutionPages[qNum] = p.pageNumber;
          }
        }
      }
    }

    return {
      firstSolutionPage,
      solutionPages
    };
  }

  /**
   * Master pipeline: Parse complete PDF document data
   * @param {object} pdfDoc - PDF.js document proxy
   * @param {function} onProgress
   * @returns {Promise<object>}
   */
  async function parseDPPDocument(pdfDoc, onProgress = null) {
    const pages = await extractPagesText(pdfDoc, onProgress);
    const metadata = parseMetadata(pages);
    const keyResult = parseAnswerKey(pages);
    const solResult = detectSolutionPages(pages, keyResult.totalQuestions);

    return {
      totalPages: pdfDoc.numPages,
      pages,
      metadata,
      answerKey: keyResult.answerKey,
      totalQuestions: keyResult.totalQuestions,
      keyPageNumber: keyResult.keyPageNumber,
      firstSolutionPage: solResult.firstSolutionPage,
      solutionPages: solResult.solutionPages
    };
  }

  const DPPParser = {
    extractPagesText,
    parseMetadata,
    parseAnswerKey,
    parseRawAnswerKeyText,
    detectSolutionPages,
    parseDPPDocument
  };

  if (typeof window !== 'undefined') {
    window.DPPParser = DPPParser;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DPPParser;
  }
})();
