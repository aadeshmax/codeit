import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { tokenizeLine, type TokenKind } from "../lib/tokenize";
import styles from "./CodeSnippetBlock.module.css";

interface CodeSnippetBlockProps {
  snippet: string;
  filePath: string;
  lineStart: number | null;
}

function tokenClass(kind: TokenKind): string | undefined {
  switch (kind) {
    case "keyword":
      return styles.keyword;
    case "string":
      return styles.string;
    case "comment":
      return styles.comment;
    case "number":
      return styles.number;
    case "fn":
      return styles.fn;
    default:
      return undefined;
  }
}

export function CodeSnippetBlock({
  snippet,
  filePath,
  lineStart
}: CodeSnippetBlockProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const lines = useMemo(() => {
    const cleaned = snippet.replace(/\r\n/g, "\n").trimEnd();
    return cleaned ? cleaned.split("\n") : [];
  }, [snippet]);

  const startNum = lineStart ?? 1;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  }, [snippet]);

  if (lines.length === 0) return null;

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <span className={styles.fileMeta}>{filePath}</span>
        <button
          type="button"
          className={styles.copyBtn}
          onClick={handleCopy}
          aria-label="Copy code snippet"
        >
          {copied ? (
            <Check size={12} strokeWidth={1.5} />
          ) : (
            <Copy size={12} strokeWidth={1.5} />
          )}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      <pre className={styles.pre}>
        <code>
          {lines.map((lineText, idx) => {
            const tokens = tokenizeLine(lineText);
            return (
              <div key={idx} className={styles.row}>
                <span className={styles.lineNum}>{startNum + idx}</span>
                <span className={styles.lineCode}>
                  {tokens.map((tok, tIdx) => (
                    <span key={tIdx} className={tokenClass(tok.kind)}>
                      {tok.text}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
