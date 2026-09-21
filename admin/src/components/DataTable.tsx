import React, { useState } from 'react';
import { Search, Inbox } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string | number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  isLoading?: boolean;
  emptyMessage?: string;
  actions?: React.ReactNode;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  searchPlaceholder = 'Filter records...',
  searchFilter,
  isLoading = false,
  emptyMessage = 'No records found',
  actions,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');

  const filteredData = React.useMemo(() => {
    if (!query || !searchFilter) return data;
    return data.filter((row) => searchFilter(row, query));
  }, [data, query, searchFilter]);

  return (
    <div>
      {/* Table controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        {searchFilter ? (
          <div className="search-bar" style={{ width: 280 }}>
            <Search size={15} color="var(--text-muted)" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        ) : <div />}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Showing {filteredData.length} of {data.length} records
          </span>
          {actions}
        </div>
      </div>

      {/* Table content */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={{ width: col.width }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <div className="loading-spinner" />
                  <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 13 }}>Loading data from server...</div>
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="empty-state">
                    <Inbox className="empty-icon" />
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {emptyMessage}
                    </div>
                    {query && (
                      <div style={{ fontSize: 13, marginTop: 4, color: 'var(--text-muted)' }}>
                        Try clearing search filters
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredData.map((row, idx) => (
                <tr key={row.id || idx}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.render ? col.render(row) : row[col.key] !== undefined ? String(row[col.key]) : '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
