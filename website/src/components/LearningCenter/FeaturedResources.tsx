import React from 'react';
import LearningCenter, { Section } from './LearningCenter';

export interface FeaturedResourcesProps {
  className?: string;
  title?: string;
  description?: string;
  sections: Section[];
}

export const FeaturedResources: React.FC<FeaturedResourcesProps> = ({ 
  className, 
  title,
  description, 
  sections 
}) => {
  return (
    <LearningCenter
      title={title}
      description={description}
      sections={sections}
      className={className}
    />
  );
};

export default FeaturedResources; 