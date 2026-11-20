import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronDown,
  Code2,
  FlaskConical,
  Gauge,
  MessageSquare,
  Shield
} from "lucide-react";
import { formatLineBadge, SEVERITY_COLOR } from "../lib/derive";
import { APPLE_SPRING, STAGGER_ITEM } from "../lib/motion";
import type { Category, DiagnosticFinding, Severity } from "../types/analysis";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import styles from "./DiagnosticCard.module.css";

interface DiagnosticCardProps {
  finding: DiagnosticFinding;
  findingKey: string;
  isStepChecked: (findingKey: string, stepIndex: number) => boolean;
  onToggleStep: (findingKey: string, stepIndex: number) => void;
  completedCount: number;
  onAskMentor: (finding: DiagnosticFinding) => void;
}

function CategoryIcon({ category }: { category: Category }) {
  switch (category) {
    case "Security":
      return <Shield size={12} strokeWidth={1.5} />;
    case "Architecture":
      return <Boxes size={12} strokeWidth={1.5} />;
    case "Efficiency":
      return <Gauge size={12} strokeWidth={1.5} />;
    case "Syntax":
      return <Code2 size={12} strokeWidth={1.5} />;
  }
}

function severityTint(severity: Severity): string {
  switch (severity) {
    case "Critical":
      return "rgba(255, 69, 58, 0.14)";
    case "High":
      return "rgba(255, 159, 10, 0.14)";
    case "Medium":
      return "rgba(255, 214, 10, 0.14)";
    case "Low":
      return "rgba(48, 209, 88, 0.14)";
  }
}

export function DiagnosticCard({
  finding,
  findingKey,
  isStepChecked,
  onToggleStep,
  completedCount,
  onAskMentor
}: DiagnosticCardProps) {
  const [impactOpen, setImpactOpen] = useState(false);
  const { diagnostic, guidance, category } = finding;
  const sevColor = SEVERITY_COLOR[diagnostic.severity];
  const lineBadge = formatLineBadge(diagnostic.line_start, diagnostic.line_end);
  const steps = guidance.investigation_steps ?? [];

  return (
    <motion.article variants={STAGGER_ITEM} className={styles.card}>
      <div className={styles.topRow}>
        <div className={styles.fileGroup}>
          <span className={styles.filePath}>{diagnostic.file_path}</span>
          <span className={styles.lineBadge}>{lineBadge}</span>
        </div>

        <div className={styles.pillGroup}>
          <span className={styles.categoryPill}>
            <CategoryIcon category={category} />
            <span>{category}</span>
          </span>
          <span
            className={styles.severityPill}
            style={{
              color: sevColor,
              backgroundColor: severityTint(diagnostic.severity),
              borderColor: `${sevColor}40`
            }}
          >
            <span
              className={styles.severityDot}
              style={{ backgroundColor: sevColor }}
            />
            <span>{diagnostic.severity}</span>
          </span>
        </div>
      </div>

      <h3 className={styles.flawHeading}>{diagnostic.flaw_type}</h3>

      {diagnostic.code_snippet && (
        <CodeSnippetBlock
          snippet={diagnostic.code_snippet}
          filePath={diagnostic.file_path}
          lineStart={diagnostic.line_start}
        />
      )}

      {/* Expandable Production Impact & Standards Ref Accordion */}
      <div className={styles.accordion}>
        <button
          type="button"
          className={styles.accordionTrigger}
          onClick={() => setImpactOpen((v) => !v)}
          aria-expanded={impactOpen}
        >
          <span className={styles.accordionTriggerLeft}>
            <AlertTriangle size={14} strokeWidth={1.5} color={sevColor} />
            <span>Production Impact</span>
            {diagnostic.standards_ref && (
              <span className={styles.accordionRefTag}>
                {diagnostic.standards_ref}
              </span>
            )}
          </span>
          <motion.span
            animate={{ rotate: impactOpen ? 180 : 0 }}
            transition={APPLE_SPRING}
            style={{ display: "inline-flex" }}
          >
            <ChevronDown size={15} strokeWidth={1.5} />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {impactOpen && (
            <motion.div
              key="impact-content"
              className={styles.accordionBody}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={APPLE_SPRING}
            >
              <div className={styles.accordionInner}>
                <p className={styles.impactText}>{diagnostic.impact_analysis}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Socratic Guidance */}
      <div className={styles.guidanceBlock}>
        <div>
          <div className={styles.sectionLabel}>Conceptual Direction</div>
          <p className={styles.directionText}>{guidance.conceptual_direction}</p>
        </div>

        <div className={styles.questionCard}>
          <div className={styles.sectionLabel}>Socratic Question</div>
          <p className={styles.questionText}>{guidance.guiding_question}</p>
        </div>

        {steps.length > 0 && (
          <div>
            <div className={styles.checklistHeader}>
              <div className={styles.sectionLabel} style={{ marginBottom: 0 }}>
                Investigation Checklist
              </div>
              <span className={styles.checklistProgress}>
                {completedCount}/{steps.length}
              </span>
            </div>
            <ul className={styles.checklist}>
              {steps.map((step, stepIdx) => {
                const checked = isStepChecked(findingKey, stepIdx);
                return (
                  <li key={stepIdx}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      className={styles.checkItemBtn}
                      onClick={() => onToggleStep(findingKey, stepIdx)}
                    >
                      <span
                        className={`${styles.checkBox} ${
                          checked ? styles.checkBoxChecked : ""
                        }`}
                      >
                        {checked && <Check size={11} strokeWidth={2} />}
                      </span>
                      <span className={checked ? styles.checkItemDone : undefined}>
                        {step}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {guidance.verification_challenge && (
          <div className={styles.challengeBox}>
            <FlaskConical
              size={15}
              strokeWidth={1.5}
              className={styles.challengeIcon}
            />
            <div>
              <div className={styles.sectionLabel}>Verification Challenge</div>
              <p className={styles.challengeText}>
                {guidance.verification_challenge}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.askBtn}
          onClick={() => onAskMentor(finding)}
        >
          <MessageSquare size={14} strokeWidth={1.5} />
          <span>Ask Mentor about this</span>
        </button>
      </div>
    </motion.article>
  );
}
