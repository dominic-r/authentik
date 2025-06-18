import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

export interface GlossaryTerm {
  id: string;
  term: string;
  shortDefinition: string;
  fullDefinition?: string;
  section?: string;
}

export interface GlossaryProps {
  terms: GlossaryTerm[];
  className?: string;
}

export const Glossary: React.FC<GlossaryProps> = ({
  terms,
  className,
}) => {
  const [expandedTerms, setExpandedTerms] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('');
  const [filteredTerms, setFilteredTerms] = useState<GlossaryTerm[]>(terms);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [isSimplifiedView, setIsSimplifiedView] = useState(false);

  const toggleTerm = (id: string) => {
    setExpandedTerms(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Group terms by section
  const termsBySection = React.useMemo(() => {
    const sections: Record<string, GlossaryTerm[]> = {};
    
    // Default section if none specified
    const defaultSection = 'General';
    
    filteredTerms.forEach(term => {
      const section = term.section || defaultSection;
      if (!sections[section]) {
        sections[section] = [];
      }
      sections[section].push(term);
    });
    
    // Sort sections by name
    return Object.entries(sections).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredTerms]);
  
  // Group terms alphabetically for A-Z view
  const termsByAlphabet = React.useMemo(() => {
    const alphabetGroups: Record<string, GlossaryTerm[]> = {};
    
    filteredTerms.forEach(term => {
      const firstLetter = term.term.charAt(0).toUpperCase();
      if (!alphabetGroups[firstLetter]) {
        alphabetGroups[firstLetter] = [];
      }
      alphabetGroups[firstLetter].push(term);
    });
    
    // Sort alphabet groups
    return Object.entries(alphabetGroups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredTerms]);
  
  // Get available sections
  const availableSections = React.useMemo(() => 
    Array.from(new Set(terms.map(term => term.section || 'General'))).sort(),
  [terms]);

  useEffect(() => {
    let result = terms;
    
    // Apply text filter (only in A-Z view)
    if (filter && isSimplifiedView) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter(term => 
        term.term.toLowerCase().includes(lowerFilter) || 
        term.shortDefinition.toLowerCase().includes(lowerFilter) ||
        (term.fullDefinition && term.fullDefinition.toLowerCase().includes(lowerFilter))
      );
    }
    
    // Apply section filter (only in categorized view)
    if (selectedSections.length > 0 && !isSimplifiedView) {
      result = result.filter(term => 
        selectedSections.includes(term.section || 'General')
      );
    }
    
    setFilteredTerms(result);
  }, [filter, selectedSections, terms, isSimplifiedView]);

  const toggleSection = (section: string) => {
    setSelectedSections(prev => {
      if (prev.includes(section)) {
        return prev.filter(s => s !== section);
      } else {
        return [...prev, section];
      }
    });
  };

  const toggleViewMode = () => {
    setIsSimplifiedView(prev => !prev);
    // Reset section filter when switching to simplified view
    if (!isSimplifiedView) {
      setSelectedSections([]);
    }
  };

  return (
    <div className={clsx(styles.glossary, className)}>
      <div className={styles.viewToggleContainer}>
        <p className={styles.viewTogglePrompt}>Select your preferred view format:</p>
        <button
          className={clsx(styles.viewToggle, !isSimplifiedView && styles.viewToggleActive)}
          onClick={() => setIsSimplifiedView(false)}
          aria-pressed={!isSimplifiedView}
        >
          Categorized View
        </button>
        <button
          className={clsx(styles.viewToggle, isSimplifiedView && styles.viewToggleActive)}
          onClick={() => setIsSimplifiedView(true)}
          aria-pressed={isSimplifiedView}
        >
          A-Z View
        </button>
      </div>
      
      {isSimplifiedView && (
        <div className={styles.filter}>
          <input
            type="text"
            placeholder="Filter terms..."
            className={styles.filterInput}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}
      
      {!isSimplifiedView && (
        <div className={styles.sectionNav}>
          {availableSections.map(section => (
            <button
              key={section}
              className={clsx(
                styles.sectionButton,
                selectedSections.includes(section) && styles.active
              )}
              onClick={() => toggleSection(section)}
            >
              {section}
            </button>
          ))}
          {selectedSections.length > 0 && (
            <button
              className={styles.clearButton}
              onClick={() => setSelectedSections([])}
              aria-label="Clear category filters"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      
      <div className={styles.termList}>
        {filteredTerms.length > 0 ? (
          isSimplifiedView ? (
            // A-Z Alphabetical simplified view (markdown-style list)
            termsByAlphabet.map(([letter, letterTerms]) => (
              <div key={letter} className={styles.simplifiedSection}>
                <h2 className={styles.sectionTitle}>{letter}</h2>
                <div className={styles.simplifiedTerms}>
                  {letterTerms.map((term) => (
                    <div key={term.id} className={styles.simplifiedTermItem} id={term.id}>
                      <h3 className={styles.simplifiedTermTitle}>{term.term}</h3>
                      <p className={styles.simplifiedDefinition}>{term.shortDefinition}</p>
                      {term.fullDefinition && (
                        <div>
                          <button 
                            className={styles.simplifiedExpandButton}
                            onClick={() => toggleTerm(term.id)}
                            aria-label={expandedTerms[term.id] ? "Collapse definition" : "Expand definition"}
                          >
                            {expandedTerms[term.id] ? '▼ Less details' : '▶ More details'}
                          </button>
                          {expandedTerms[term.id] && (
                            <ul className={styles.simplifiedFullDefinition}>
                              <li>{term.fullDefinition}</li>
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            // Categorized view (original)
            termsBySection.map(([section, sectionTerms]) => (
              <div key={section} className={styles.section}>
                <h2 className={styles.sectionTitle}>{section}</h2>
                <div className={styles.sectionTerms}>
                  {sectionTerms.map((term) => (
                    <div key={term.id} className={styles.termItem} id={term.id}>
                      <div className={styles.termHeader}>
                        <h3 className={styles.termTitle}>{term.term}</h3>
                        {term.fullDefinition && (
                          <button 
                            className={styles.expandButton}
                            onClick={() => toggleTerm(term.id)}
                            aria-label={expandedTerms[term.id] ? "Collapse definition" : "Expand definition"}
                          >
                            {expandedTerms[term.id] ? 'Less' : 'More'}
                          </button>
                        )}
                      </div>
                      <p className={styles.shortDefinition}>{term.shortDefinition}</p>
                      {term.fullDefinition && expandedTerms[term.id] && (
                        <div className={styles.fullDefinition}>
                          <p>{term.fullDefinition}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )
        ) : (
          <div className={styles.noResults}>
            <p>No terms match your filter criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Glossary; 