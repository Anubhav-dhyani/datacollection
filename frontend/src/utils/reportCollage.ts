export type CollageEmployee = {
  employeeId: string;
  employeeName: string;
  city: string;
  studentsAttended: number | 'NA' | null;
  photo: { url: string } | null;
};

// Balanced rows keep seven photos in a 2 / 3 / 2 layout like a contact sheet.
function rowSizes(count: number) {
  if (count <= 3) return [count];
  if (count === 4) return [2, 2];
  if (count === 5) return [2, 3];
  if (count === 6) return [3, 3];
  return [2, 3, 2];
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight = 600) {
  let fontSize = size;
  context.font = `${weight} ${fontSize}px Arial, sans-serif`;
  while (context.measureText(text).width > maxWidth && fontSize > 12) {
    fontSize -= 1;
    context.font = `${weight} ${fontSize}px Arial, sans-serif`;
  }
  // Extremely long names/cities wrap within their caption instead of being cut off.
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

export async function renderCollage(employees: CollageEmployee[], date: string, page: number, total: number, signal: AbortSignal): Promise<Blob> {
  if (!employees.length || employees.length > 7) throw new Error('A collage must contain 1 to 7 employees.');
  const canvas = document.createElement('canvas');
  canvas.width = 2400;
  const rows = rowSizes(employees.length), gap = 18, header = 100, rowHeight = 720;
  canvas.height = header + rows.length * (rowHeight + gap) + gap;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not create the collage. Please try another browser.');
  try {
    context.fillStyle = '#080808';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ffffff';
    context.font = '600 36px Arial, sans-serif';
    context.fillText(`Event reports · ${date}`, gap + 12, 62);
    context.textAlign = 'right';
    context.font = '28px Arial, sans-serif';
    context.fillText(`Collage ${page} / ${total}`, canvas.width - gap - 12, 62);
    context.textAlign = 'left';
    let employeeIndex = 0;
    for (let row = 0; row < rows.length; row++) {
      const columns = rows[row], width = (canvas.width - gap * (columns + 1)) / columns;
      for (let column = 0; column < columns; column++) {
        signal.throwIfAborted();
        const person = employees[employeeIndex++];
        if (!person.photo) throw new Error(`No photo available for ${person.employeeName}.`);
        const x = gap + column * (width + gap), y = header + gap + row * (rowHeight + gap);
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
          // Keep the full photo's proportions; place a readable caption on its lower edge.
          const photoHeight = rowHeight;
          context.fillStyle = '#171717';
          context.fillRect(x, y, width, rowHeight);
          const scale = Math.min(width / image.width, photoHeight / image.height);
          const drawWidth = image.width * scale, drawHeight = image.height * scale;
          context.drawImage(image, x + (width - drawWidth) / 2, y + (photoHeight - drawHeight) / 2, drawWidth, drawHeight);
          const gradient = context.createLinearGradient(0, y + rowHeight - 160, 0, y + rowHeight);
          gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
          gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.8)');
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
          context.fillStyle = gradient;
          context.fillRect(x, y + rowHeight - 160, width, 160);
          context.fillStyle = '#ffffff';
          const attendance = person.studentsAttended === 'NA' || person.studentsAttended === null ? 'Students: N/A' : `${person.studentsAttended} students`;
          const label = `${person.city || 'City unavailable'} · ${attendance}`;
          const lines = fitText(context, label, width - 40, 36);
          lines.forEach((line, index) => context.fillText(line, x + 20, y + rowHeight - 76 + index * 18));
          const names = fitText(context, person.employeeName, width - 40, 28, 400);
          context.fillStyle = '#dddddd';
          names.forEach((line, index) => context.fillText(line, x + 20, y + rowHeight - 24 - (names.length - 1 - index) * 14));
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
