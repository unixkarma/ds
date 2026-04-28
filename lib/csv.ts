// CSV export helpers — used by report components.
// Escapes quotes/commas/newlines per RFC 4180 and triggers a browser download.

export interface CSVColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCSV<T>(rows: T[], columns: CSVColumn<T>[]): string {
  const header = columns.map(c => escapeCell(c.header)).join(',')
  const body = rows
    .map(row => columns.map(c => escapeCell(c.value(row))).join(','))
    .join('\r\n')
  return body ? `${header}\r\n${body}` : header
}

export function downloadCSV(filename: string, csv: string): void {
  // BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
