import React from 'react';
import LearningCenter, { Section } from './LearningCenter';

export interface FeaturedResourcesProps {
  className?: string;
  description?: string;
  sections: Section[];
}

export const FeaturedResources: React.FC<FeaturedResourcesProps> = ({ className, description, sections }) => {
  return (
    <LearningCenter
      description={description}
      sections={sections}
      className={className}
    />
  );
};

export default FeaturedResources; 