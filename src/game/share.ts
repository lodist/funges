/** The share card: the run's last picture, four times as large, with the
 *  score under it. Through the phone's share sheet, or saved where there is
 *  none. */
export async function shareRun(
  screen: HTMLCanvasElement,
  words: { title: string; line: string; text: string }
) {
  const card = document.createElement('canvas');
  card.width = 1280;
  card.height = 860;
  const ctx = card.getContext('2d');
  if (!ctx) return;
  // The screen is at full resolution now: scale it down smoothly. A screen
  // wider than 16:9 gives its first 16:9, where the squirrel is.
  ctx.imageSmoothingQuality = 'high';
  const h = screen.height;
  ctx.drawImage(screen, 0, 0, (h * 16) / 9, h, 0, 0, 1280, 720);
  ctx.fillStyle = '#1f3d2b';
  ctx.fillRect(0, 720, 1280, 140);
  const font = getComputedStyle(document.body).fontFamily;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.font = `700 44px ${font}`;
  ctx.fillText(words.title, 40, 762);
  ctx.font = `500 34px ${font}`;
  ctx.fillText(words.line, 40, 818);
  ctx.textAlign = 'right';
  ctx.fillText('fung.es/play', 1240, 790);
  const blob = await new Promise<Blob | null>(done =>
    card.toBlob(done, 'image/png')
  );
  if (!blob) return;
  const file = new File([blob], 'squirrel-run.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    // Closing the share sheet rejects: nothing to do.
    await navigator.share({ files: [file], text: words.text }).catch(() => {});
    return;
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(link.href);
}
