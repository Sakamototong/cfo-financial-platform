import React, { useState, useEffect } from 'react';
import './KeyboardShortcuts.css';

interface Shortcut {
  keys: string[];
  description: string;
  category: 'Global' | 'Navigation' | 'Actions' | 'Tables';
}

const KeyboardShortcuts: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  const shortcuts: Shortcut[] = [
    // Global
    { keys: ['⌘', 'K'], description: 'Open Command Palette', category: 'Global' },
    { keys: ['?'], description: 'Show this keyboard shortcuts guide', category: 'Global' },
    { keys: ['Esc'], description: 'Close modals and dialogs', category: 'Global' },
    { keys: ['⌘', 'P'], description: 'Print current page', category: 'Global' },
    
    // Navigation
    { keys: ['G', 'H'], description: 'Go to Dashboard (Home)', category: 'Navigation' },
    { keys: ['G', 'S'], description: 'Go to Scenarios', category: 'Navigation' },
    { keys: ['G', 'F'], description: 'Go to Financial Statements', category: 'Navigation' },
    { keys: ['G', 'B'], description: 'Go to Budgets', category: 'Navigation' },
    { keys: ['G', 'C'], description: 'Go to Cash Flow', category: 'Navigation' },
    { keys: ['G', 'R'], description: 'Go to Reports', category: 'Navigation' },
    
    // Actions
    { keys: ['N'], description: 'Create new item (context-aware)', category: 'Actions' },
    { keys: ['E'], description: 'Edit selected item', category: 'Actions' },
    { keys: ['⌘', 'S'], description: 'Save current form', category: 'Actions' },
    { keys: ['⌘', 'Enter'], description: 'Submit current form', category: 'Actions' },
    { keys: ['Del'], description: 'Delete selected item', category: 'Actions' },
    
    // Tables
    { keys: ['↑', '↓'], description: 'Navigate table rows', category: 'Tables' },
    { keys: ['Enter'], description: 'Open selected row', category: 'Tables' },
    { keys: ['Space'], description: 'Select/deselect row', category: 'Tables' },
    { keys: ['⌘', 'A'], description: 'Select all rows', category: 'Tables' },
  ];

  // Listen for ? key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Check if not in input/textarea
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setIsOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isOpen) return null;

  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) acc[shortcut.category] = [];
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, Shortcut[]>);

  return (
    <div className="shortcuts-overlay" onClick={() => setIsOpen(false)}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h2>⌨️ Keyboard Shortcuts</h2>
          <button onClick={() => setIsOpen(false)} className="btn-close-shortcuts">
            ×
          </button>
        </div>

        <div className="shortcuts-content">
          {Object.entries(groupedShortcuts).map(([category, items]) => (
            <div key={category} className="shortcuts-category">
              <h3>{category}</h3>
              <div className="shortcuts-list">
                {items.map((shortcut, idx) => (
                  <div key={idx} className="shortcut-item">
                    <div className="shortcut-keys">
                      {shortcut.keys.map((key, keyIdx) => (
                        <React.Fragment key={keyIdx}>
                          <kbd>{key}</kbd>
                          {keyIdx < shortcut.keys.length - 1 && (
                            <span className="key-sep">+</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                    <div className="shortcut-description">{shortcut.description}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="shortcuts-footer">
          <p>Press <kbd>?</kbd> anytime to view this guide</p>
          <p>Press <kbd>Esc</kbd> to close</p>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcuts;
