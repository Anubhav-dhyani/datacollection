export type CollageEmployee = {
  employeeId: string;
  employeeName: string;
  city: string;
  studentsAttended: number | 'NA' | null;
  photo: { url: string } | null;
};

export const COLLAGE_PHOTO_LIMIT = 9;

// The full collage follows the reference: two wide photos, then three, then four.
function rowSizes(count: number) {
  if (count <= 3) return [count];
  if (count === 4) return [2, 2];
  if (count === 5) return [2, 3];
  if (count === 6) return [3, 3];
  if (count === 7) return [2, 2, 3];
  if (count === 8) return [2, 3, 3];
  return [2, 3, 4];
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number, size: number) {
  let fontSize = size;
  context.font = `400 ${fontSize}px Arial, sans-serif`;
  while (context.measureText(text).width > maxWidth && fontSize > 12) {
    fontSize -= 1;
    context.font = `400 ${fontSize}px Arial, sans-serif`;
  }
  // Long city labels wrap rather than running into the adjacent photo.
  if (context.measureText(text).width <= maxWidth) return [text];
  const lines: string[] = [];
  let line = '';
  for (const character of text) {
    if (line && context.measureText(line + character).width > maxWidth) { lines.push(line); line = ''; }
    line += character;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderCollage(employees: CollageEmployee[], signal: AbortSignal): Promise<Blob> {
  if (!employees.length || employees.length > COLLAGE_PHOTO_LIMIT) throw new Error('A collage must contain 1 to 9 employees.');
  const canvas = document.createElement('canvas');
  canvas.width = 2400;
  const rows = rowSizes(employees.length), gap = 18;
  const heights = rows.length === 3 ? [680, 800, 848] : rows.map(() => rows.length === 1 ? 1200 : 900);
  canvas.height = heights.reduce((sum, height) => sum + height, 0) + gap * (rows.length + 1);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not create the collage. Please try another browser.');
  try {
    context.fillStyle = '#080808';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    let employeeIndex = 0;
    for (let row = 0; row < rows.length; row++) {
      const columns = rows[row], width = (canvas.width - gap * (columns + 1)) / columns;
      const rowHeight = heights[row];
      for (let column = 0; column < columns; column++) {
        signal.throwIfAborted();
        const person = employees[employeeIndex++];
        if (!person.photo) throw new Error(`No photo available for ${person.employeeName}.`);
        const x = gap + column * (width + gap), y = gap + heights.slice(0, row).reduce((sum, height) => sum + height + gap, 0);
        let image: ImageBitmap;
        try {
          const response = await fetch(person.photo.url, { credentials: 'include', signal });
          if (!response.ok) throw new Error('Photo request failed.');
          image = await createImageBitmap(await response.blob());
        } catch {
          signal.throwIfAborted();
          throw new Error(`Could not load the photo for ${person.employeeName}. Please try again.`);
        }
        try {
          signal.throwIfAborted();
          // Crop centrally to fill the tile without stretching or black letterboxing.
          const scale = Math.max(width / image.width, rowHeight / image.height);
          const sourceWidth = Math.min(image.width, width / scale), sourceHeight = Math.min(image.height, rowHeight / scale);
          context.drawImage(image, (image.width - sourceWidth) / 2, (image.height - sourceHeight) / 2,
            sourceWidth, sourceHeight, x, y, width, rowHeight);
          context.fillStyle = '#ffffff';
          const attendance = person.studentsAttended === 'NA' || person.studentsAttended === null ? 'N/A' : person.studentsAttended;
          const label = `${person.city || 'City unavailable'}, ${attendance}`;
          const lines = fitText(context, label, width - 48, columns <= 2 ? 72 : 60);
          context.shadowColor = 'rgba(0, 0, 0, 0.8)';
          context.shadowBlur = 4;
          context.shadowOffsetY = 2;
          lines.forEach((line, index) => context.fillText(line, x + width / 2, y + 84 + index * 18));
          context.shadowColor = 'transparent';
          context.shadowBlur = 0;
          context.shadowOffsetY = 0;
        } finally { image.close(); }
      }
    }
    signal.throwIfAborted();
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not export the collage.')), 'image/jpeg', 0.94));
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
