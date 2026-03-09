'use client';

import { useState } from 'react';
import { FilterButton } from './filter-button';
import { FilterModal } from './filter-modal';

export function FilterButtonWithModal() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  return (
    <>
      <FilterButton onClick={() => setIsModalOpen(true)} />
      <FilterModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
}
