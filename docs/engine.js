export const voices = ['Soprano','Contralto','Tenor','Barítono','Baixo'];
export const instruments = ['Bateria','Baixo elétrico','Teclado','Guitarra','Violão','Percussão'];
export const roles = [...instruments, ...voices.map(voice => 'Vocal • ' + voice)];
export const isVocal = role => role.startsWith('Vocal • ');
export const eligible = (person, role) => isVocal(role) ? role === 'Vocal • ' + person.voice : person.instruments.includes(role);
export const talkback = (day, people) => people.filter(person => person.active && person.talk && day.slots.some(slot => slot.person === person.id && !isVocal(slot.role)) && !day.slots.some(slot => slot.person === person.id && isVocal(slot.role)));
export function candidates(day, index, people, available) {
  const {role,person: current} = day.slots[index];
  return people.filter(person => person.id === current || (person.active && available[person.id]?.includes(day.date) && eligible(person, role) && day.slots.every((slot, other) => other === index || slot.person !== person.id || (role === 'Violão' && isVocal(slot.role)))));
}
export function generate(date, formation, people, available, counts) {
  const slots = Object.entries(formation).flatMap(([role, count]) => Array.from({length: count}, () => ({role,person:''})));
  const ranked = people.filter(person => person.active && available[person.id]?.includes(date)).sort((a,b) => (counts[a.id] || 0) - (counts[b.id] || 0) || a.name.localeCompare(b.name,'pt-BR'));
  const assigned = new Map();
  // Busca caminhos alternados para preencher o máximo de vagas do domingo.
  function fill(index, visited) {
    for (const person of ranked) {
      if (visited.has(person.id) || !eligible(person,slots[index].role)) continue;
      visited.add(person.id);
      if (!assigned.has(person.id) || fill(assigned.get(person.id),visited)) {
        assigned.set(person.id,index);
        return true;
      }
    }
    return false;
  }
  for (const index of slots.keys()) fill(index,new Set());
  for (const [id,index] of assigned) {
    slots[index].person = id;
    counts[id] = (counts[id] || 0) + 1;
  }
  const day = {date,slots,talk:''};
  day.talk = talkback(day,ranked)[0]?.id || '';
  return day;
}
