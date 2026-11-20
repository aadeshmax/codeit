import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Copy,
  ExternalLink,
  GitPullRequest,
  ShieldCheck,
  Webhook,
  X
} from "lucide-react";
import {
  GITHUB_APP_ID,
  GITHUB_APP_INSTALL_URL,
  WEBHOOK_ENDPOINT_URL
} from "../config";
import { formatRepoSlug } from "../lib/derive";
import { APPLE_SPRING } from "../lib/motion";
import styles from "./WebhookAppModal.module.css";

interface WebhookAppModalProps {
  open: boolean;
  repoUrl: string | null;
  onClose: () => void;
}

export function WebhookAppModal({
  open,
  repoUrl,
  onClose
}: WebhookAppModalProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  const repoSlug = repoUrl ? formatRepoSlug(repoUrl) : null;

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleCopyWebhook = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_ENDPOINT_URL);
      setCopied(true);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="webhook-backdrop"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />

          <div className={styles.modalWrap}>
            <motion.div
              key="webhook-dialog"
              className={styles.modal}
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={APPLE_SPRING}
              role="dialog"
              aria-modal="true"
              aria-labelledby="webhook-modal-title"
            >
              <div className={styles.header}>
                <div className={styles.titleGroup}>
                  <div className={styles.iconBadge}>
                    <Webhook size={17} strokeWidth={1.5} />
                  </div>
                  <div className={styles.titleTextWrap}>
                    <h2 id="webhook-modal-title" className={styles.title}>
                      GitHub App Webhook
                    </h2>
                    <span className={styles.appIdBadge}>
                      Codelitlabs · App ID {GITHUB_APP_ID}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={onClose}
                  aria-label="Close GitHub App dialog"
                >
                  <X size={15} strokeWidth={1.5} />
                </button>
              </div>

              <p className={styles.question}>
                {repoSlug ? (
                  <>
                    Add the Codelitlabs GitHub App to{" "}
                    <span className={styles.repoHighlight}>{repoSlug}</span> for
                    automated pull request reviews and commit status checks?
                  </>
                ) : (
                  "Add the Codelitlabs GitHub App to your repository for automated pull request reviews and commit status checks?"
                )}
              </p>

              <div className={styles.endpointBlock}>
                <div className={styles.endpointLabelRow}>
                  <span className={styles.sectionLabel}>Webhook Endpoint</span>
                  <button
                    type="button"
                    className={`${styles.copyBtn} ${
                      copied ? styles.copyBtnDone : ""
                    }`}
                    onClick={handleCopyWebhook}
                  >
                    {copied ? (
                      <Check size={11} strokeWidth={1.5} />
                    ) : (
                      <Copy size={11} strokeWidth={1.5} />
                    )}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <code className={styles.endpointUrl}>{WEBHOOK_ENDPOINT_URL}</code>
              </div>

              <div className={styles.metaGrid}>
                <div className={styles.metaRow}>
                  <span className={styles.metaKey}>
                    <GitPullRequest size={13} strokeWidth={1.5} />
                    <span>Subscribed Events</span>
                  </span>
                  <span className={styles.metaVal}>pull_request, push</span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaKey}>
                    <ShieldCheck size={13} strokeWidth={1.5} />
                    <span>Signature Verification</span>
                  </span>
                  <span className={styles.metaVal}>X-Hub-Signature-256</span>
                </div>
              </div>

              <div className={styles.footer}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={onClose}
                >
                  Not now
                </button>
                <a
                  href={GITHUB_APP_INSTALL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.primaryLink}
                  onClick={onClose}
                >
                  <span>Install GitHub App</span>
                  <ExternalLink size={14} strokeWidth={1.5} />
                </a>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
