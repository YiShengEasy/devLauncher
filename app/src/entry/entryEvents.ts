export const SEARCH_PREFILL_EVENT = "devlauncher-search-prefill";
export const OCR_REPORT_TEXT_EVENT = "devlauncher-ocr-report-text";

export interface SearchPrefillPayload {
  text: string;
}

export interface OcrReportTextPayload {
  text: string;
}
