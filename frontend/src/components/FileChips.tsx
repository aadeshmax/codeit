import { motion } from "framer-motion";
import { FileCode2 } from "lucide-react";
import { pathsMatch } from "../lib/derive";
import { STAGGER_ITEM, STAGGER_LIST } from "../lib/motion";
import styles from "./FileChips.module.css";

interface FileChipsProps {
  files: string[];
  activeFile: string | null;
  onSelectFile: (filePath: string | null) => void;
}

export function FileChips({
  files,
  activeFile,
  onSelectFile
}: FileChipsProps) {
  if (files.length === 0) return null;

  return (
    <motion.div
      className={styles.bar}
      variants={STAGGER_LIST}
      initial="hidden"
      animate="show"
      aria-label="Classified repository files"
    >
      <span className={styles.label}>Scope</span>
      {files.map((filePath) => {
        const isSelected =
          activeFile !== null && pathsMatch(activeFile, filePath);
        return (
          <motion.button
            key={filePath}
            type="button"
            variants={STAGGER_ITEM}
            className={`${styles.chip} ${isSelected ? styles.chipActive : ""}`}
            onClick={() => onSelectFile(isSelected ? null : filePath)}
          >
            <FileCode2 size={12} strokeWidth={1.5} />
            <span>{filePath}</span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
