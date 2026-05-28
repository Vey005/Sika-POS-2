/** Dotted separator for thermal printers (ASCII dots). */
export function thermalDottedLine(length: number): string {
  if (length <= 0) return '';
  const unit = '. ';
  let line = '';
  while (line.length < length) line += unit;
  return line.slice(0, length).padEnd(length, '.');
}
