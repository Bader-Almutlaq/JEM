import { useId, useState } from 'react';
import styles from './ChartTable.module.css';
import { TablePill } from './TablePill';

/**
 * Accessible table alternative for a chart, behind a small "Table" pill aligned to the chart's left edge.
 * Rows have stable keys and preformatted display cells.
 */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly { readonly key: string; readonly cells: readonly string[] }[];
}) {
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <>
      <TablePill shown={shown} controls={id} onToggle={() => setShown(!shown)} />
      {shown && (
        <div className={styles.scroll} id={id}>
          <table className={styles.table}>
            <caption>{caption}</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  {row.cells.map((cell, index) =>
                    index === 0 ? (
                      <th scope="row" key={index}>
                        {cell}
                      </th>
                    ) : (
                      <td key={index}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
