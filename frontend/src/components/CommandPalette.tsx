import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './CommandPalette.css';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  action: () => void;
  category: 'navigation' | 'action' | 'recent';
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Define all available commands
  const allCommands: CommandItem[] = [
    // Navigation
    { id: 'nav-dashboard', label: 'Dashboard', icon: '🏠', action: () => navigate('/'), category: 'navigation', keywords: ['home', 'main'] },
    { id: 'nav-scenarios', label: 'Scenarios', icon: '🎯', action: () => navigate('/scenarios'), category: 'navigation', keywords: ['scenario', 'analysis'] },
    { id: 'nav-financials', label: 'Financial Statements', icon: '📊', action: () => navigate('/financials'), category: 'navigation', keywords: ['statement', 'finance', 'report'] },
    { id: 'nav-projections', label: 'Projections', icon: '📈', action: () => navigate('/projections'), category: 'navigation', keywords: ['forecast', 'projection'] },
    { id: 'nav-consolidation', label: 'Consolidation', icon: '🔗', action: () => navigate('/consolidation'), category: 'navigation', keywords: ['consolidate', 'merge'] },
    { id: 'nav-reports', label: 'Reports', icon: '📑', action: () => navigate('/reports'), category: 'navigation', keywords: ['report', 'analytics'] },
    { id: 'nav-budget-actual', label: 'Budget vs Actual Report', icon: '📊', action: () => navigate('/reports/budget-vs-actual'), category: 'navigation', keywords: ['budget', 'actual', 'variance'] },
    { id: 'nav-etl', label: 'Data Import (ETL)', icon: '📥', action: () => navigate('/etl-import'), category: 'navigation', keywords: ['import', 'etl', 'upload', 'data'] },
    { id: 'nav-dim', label: 'Data Integrity', icon: '🔍', action: () => navigate('/dim'), category: 'navigation', keywords: ['integrity', 'quality', 'validation'] },
    { id: 'nav-coa', label: 'Chart of Accounts', icon: '📊', action: () => navigate('/coa'), category: 'navigation', keywords: ['chart', 'accounts', 'coa'] },
    { id: 'nav-budgets', label: 'Budgets', icon: '💰', action: () => navigate('/budgets'), category: 'navigation', keywords: ['budget', 'planning'] },
    { id: 'nav-cashflow', label: 'Cash Flow Forecast', icon: '💵', action: () => navigate('/cashflow'), category: 'navigation', keywords: ['cash', 'flow', 'forecast', 'liquidity'] },
    { id: 'nav-version', label: 'Version History', icon: '📜', action: () => navigate('/version-history'), category: 'navigation', keywords: ['version', 'history', 'audit'] },
    { id: 'nav-workflow', label: 'Workflow', icon: '🔄', action: () => navigate('/workflow'), category: 'navigation', keywords: ['workflow', 'approval'] },
    { id: 'nav-users', label: 'Users', icon: '👥', action: () => navigate('/users'), category: 'navigation', keywords: ['user', 'team', 'people'] },
    { id: 'nav-profile', label: 'Company Profile', icon: '🏢', action: () => navigate('/profile'), category: 'navigation', keywords: ['profile', 'company', 'settings'] },
    { id: 'nav-settings', label: 'Settings', icon: '⚙️', action: () => navigate('/settings'), category: 'navigation', keywords: ['settings', 'config', 'preferences'] },

    // Quick Actions
    { id: 'action-new-scenario', label: 'Create New Scenario', icon: '➕', description: 'Start a new financial scenario', action: () => navigate('/scenarios'), category: 'action', keywords: ['new', 'create', 'scenario'] },
    { id: 'action-new-budget', label: 'Create New Budget', icon: '➕', description: 'Create a new budget', action: () => navigate('/budgets'), category: 'action', keywords: ['new', 'create', 'budget'] },
    { id: 'action-new-forecast', label: 'Create Cash Flow Forecast', icon: '➕', description: 'Create a 13-week cash flow forecast', action: () => navigate('/cashflow'), category: 'action', keywords: ['new', 'create', 'cash', 'forecast'] },
    { id: 'action-import-data', label: 'Import Data', icon: '📤', description: 'Import financial data via ETL', action: () => navigate('/etl-import'), category: 'action', keywords: ['import', 'upload', 'data'] },
    { id: 'action-refresh', label: 'Refresh Page', icon: '🔄', description: 'Reload current page', action: () => window.location.reload(), category: 'action', keywords: ['refresh', 'reload'] },
  ];

  // Filter commands based on query
  const filteredCommands = query.trim() === '' 
    ? allCommands 
    : allCommands.filter(cmd => {
        const searchText = query.toLowerCase();
        const labelMatch = cmd.label.toLowerCase().includes(searchText);
        const descMatch = cmd.description?.toLowerCase().includes(searchText);
        const keywordMatch = cmd.keywords?.some(kw => kw.toLowerCase().includes(searchText));
        return labelMatch || descMatch || keywordMatch;
      });

  // Group by category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onClose]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'navigation': return '🧭 Navigation';
      case 'action': return '⚡ Quick Actions';
      case 'recent': return '🕐 Recent';
      default: return category;
    }
  };

  let currentIndex = 0;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-search">
          <span className="search-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search... (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="command-input"
          />
          <kbd className="shortcut-hint">⌘K</kbd>
        </div>

        <div className="command-results">
          {filteredCommands.length === 0 ? (
            <div className="no-results">
              <p>No commands found for "{query}"</p>
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, commands]) => (
              <div key={category} className="command-category">
                <div className="category-label">{getCategoryLabel(category)}</div>
                {commands.map((cmd) => {
                  const itemIndex = currentIndex++;
                  const isSelected = itemIndex === selectedIndex;
                  
                  return (
                    <div
                      key={cmd.id}
                      className={`command-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        cmd.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                    >
                      <div className="command-icon">{cmd.icon}</div>
                      <div className="command-content">
                        <div className="command-label">{cmd.label}</div>
                        {cmd.description && (
                          <div className="command-description">{cmd.description}</div>
                        )}
                      </div>
                      {isSelected && <kbd className="enter-hint">↵</kbd>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="command-footer">
          <div className="footer-hints">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Execute</span>
            <span><kbd>Esc</kbd> Close</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
