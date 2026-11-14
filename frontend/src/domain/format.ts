export function initials(name: string) {
  return name.replace(/[^A-Za-z ]/g, ' ').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('');
}
