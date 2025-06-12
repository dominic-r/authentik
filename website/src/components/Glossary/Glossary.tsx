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
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

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
  
  // Get available sections
  const availableSections = React.useMemo(() => 
    Array.from(new Set(terms.map(term => term.section || 'General'))).sort(),
  [terms]);

  useEffect(() => {
    let result = terms;
    
    // Apply text filter
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter(term => 
        term.term.toLowerCase().includes(lowerFilter) || 
        term.shortDefinition.toLowerCase().includes(lowerFilter) ||
        (term.fullDefinition && term.fullDefinition.toLowerCase().includes(lowerFilter))
      );
    }
    
    // Apply section filter
    if (selectedSection) {
      result = result.filter(term => 
        (term.section || 'General') === selectedSection
      );
    }
    
    setFilteredTerms(result);
  }, [filter, selectedSection, terms]);

  const handleSectionClick = (section: string) => {
    setSelectedSection(prev => prev === section ? null : section);
  };

  return (
    <div className={clsx(styles.glossary, className)}>
      <div className={styles.filter}>
        <input
          type="text"
          placeholder="Filter terms..."
          className={styles.filterInput}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      
      <div className={styles.sectionNav}>
        {availableSections.map(section => (
          <button
            key={section}
            className={clsx(
              styles.sectionButton,
              selectedSection === section && styles.active
            )}
            onClick={() => handleSectionClick(section)}
          >
            {section}
          </button>
        ))}
      </div>
      
      <div className={styles.termList}>
        {filteredTerms.length > 0 ? (
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