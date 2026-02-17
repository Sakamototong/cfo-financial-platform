import React, { useState } from 'react'

interface FilterConfig {
  key: string
  label: string
  type: 'text' | 'select' | 'date' | 'number'
  options?: { value: string; label: string }[]
}

interface TableFilterProps {
  filters: FilterConfig[]
  onFilterChange: (filters: Record<string, any>) => void
}

export default function TableFilter({ filters, onFilterChange }: TableFilterProps) {
  const [values, setValues] = useState<Record<string, any>>({})
  const [isExpanded, setIsExpanded] = useState(false)

  const handleChange = (key: string, value: any) => {
    const newValues = { ...values, [key]: value }
    setValues(newValues)
    onFilterChange(newValues)
  }

  const handleReset = () => {
    setValues({})
    onFilterChange({})
  }

  const activeFilterCount = Object.keys(values).filter(k => values[k]).length

  return (
    <div className="table-filter">
      <div className="filter-header">
        <button 
          className="btn btn-outline"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          🔍 Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
        </button>
        {activeFilterCount > 0 && (
          <button className="btn-text" onClick={handleReset}>
            Reset all
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="filter-panel card mt-4">
          <div className="filter-grid">
            {filters.map(filter => (
              <div key={filter.key} className="filter-field">
                <label>{filter.label}</label>
                {filter.type === 'text' && (
                  <input
                    type="text"
                    value={values[filter.key] || ''}
                    onChange={(e) => handleChange(filter.key, e.target.value)}
                    placeholder={`Search ${filter.label.toLowerCase()}...`}
                    className="form-input"
                  />
                )}
                {filter.type === 'select' && (
                  <select
                    value={values[filter.key] || ''}
                    onChange={(e) => handleChange(filter.key, e.target.value)}
                    className="form-input"
                  >
                    <option value="">All</option>
                    {filter.options?.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
                {filter.type === 'date' && (
                  <input
                    type="date"
                    value={values[filter.key] || ''}
                    onChange={(e) => handleChange(filter.key, e.target.value)}
                    className="form-input"
                  />
                )}
                {filter.type === 'number' && (
                  <input
                    type="number"
                    value={values[filter.key] || ''}
                    onChange={(e) => handleChange(filter.key, e.target.value)}
                    placeholder={`Filter by ${filter.label.toLowerCase()}...`}
                    className="form-input"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
