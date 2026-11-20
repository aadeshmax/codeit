import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, FileText, LayoutGrid } from "lucide-react";
import { APPLE_SPRING } from "../lib/motion";
import styles from "./ExportFormatToggle.module.css";

export type ViewMode = "dashboard" | "plaintext";

interface ExportFormatToggleProps {
  mode: ViewMode;
  onChangeMode: (mode: ViewMode) => void;
  formattedText: string;
}

export function ExportFormatToggle({
  mode,
  onChangeMode,
  formattedText
}: ExportFormatToggleProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (!formattedText) return;
    try {
      await navigator.clipboard.writeText(formattedText);
      setCopied(true);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  }, [formattedText]);

  return (
    <div className={styles.wrap}>
      <div className={styles.segmented} role="tablist" aria-label="Report format">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "dashboard"}
          className={`${styles.segmentBtn} ${
            mode === "dashboard" ? styles.segmentBtnActive : ""
          }`}
          onClick={() => onChangeMode("dashboard")}
        >
          {mode === "dashboard" && (
            <motion.span
              layoutId="export-view-pill"
              className={styles.activePill}
              transition={APPLE_SPRING}
            />
          )}
          <LayoutGrid size={13} strokeWidth={1.5} />
          <span>Dashboard</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={mode === "plaintext"}
          className={`${styles.segmentBtn} ${
            mode === "plaintext" ? styles.segmentBtnActive : ""
          }`}
          onClick={() => onChangeMode("plaintext")}
        >
          {mode === "plaintext" && (
            <motion.span
              layoutId="export-view-pill"
              className={styles.activePill}
              transition={APPLE_SPRING}
            />
          )}
          <FileText size={13} strokeWidth={1.5} />
          <span>Plain Text</span>
        </button>
      </div>

      <button
        type="button"
        className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ""}`}
        onClick={handleCopy}
        title="Copy formatted plain-text report"
      >
        {copied ? (
          <Check size={13} strokeWidth={1.5} />
        ) : (
          <Copy size={13} strokeWidth={1.5} />
        )}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}
