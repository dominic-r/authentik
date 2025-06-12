import React from "react";
import Link from "@docusaurus/Link";
import clsx from "clsx";
import styles from "./styles.module.css";

export interface SectionLink {
    title: string;
    url: string;
}

export interface Section {
    title: string;
    description: string;
    links: SectionLink[];
}

export interface LearningCenterProps {
    description?: string;
    sections: Section[];
    className?: string;
}

export const LearningCenter: React.FC<LearningCenterProps> = ({
    description,
    sections,
    className,
}) => {
    return (
        <div className={clsx(styles.learningCenter, className)}>
            {description && <p className={styles.description}>{description}</p>}
            
            <div className={styles.sectionGrid}>
                {sections.map((section, idx) => (
                    <div key={idx} className={styles.sectionCard}>
                        <h3 className={styles.sectionTitle}>{section.title}</h3>
                        <p className={styles.sectionDescription}>{section.description}</p>
                        {section.links && section.links.length > 0 && (
                            <div className={styles.sectionLinks}>
                                {section.links.map((link, linkIdx) => (
                                    <a 
                                        key={linkIdx}
                                        href={link.url}
                                        className={styles.sectionLink}
                                    >
                                        <i className="fa fa-arrow-right"></i>
                                        {link.title}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LearningCenter; 