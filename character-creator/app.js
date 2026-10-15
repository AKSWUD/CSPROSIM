const data = CREATOR_DATA;
const $ = id => document.getElementById(id);
const baseNames = Object.keys(data.baseLabels);
const colors = ['F', 'E', 'T', 'O', 'C', 'S', 'U'];
const roleLabel = role => ({'道具位': '辅助位', IGL: '指挥'}[role] || role);
const escapeText = text => String(text).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
let base = Object.fromEntries(baseNames.map(name => [name, data.creationBudget / baseNames.length]));
let role = data.roles[0];

function build() {
  $('base-inputs').innerHTML = baseNames.map(name => `<div class="base-row">
    <label for="base-${name}">${data.baseLabels[name]}</label>
    <input type="range" min="0" max="${data.openingLimits[name]}" step="1" data-base="${name}" aria-label="${data.baseLabels[name]}滑块">
    <input id="base-${name}" type="number" min="0" max="${data.openingLimits[name]}" step="1" data-base="${name}"></div>`).join('');
  $('role').innerHTML = data.roles.map(value => `<option value="${value}">${roleLabel(value)}</option>`).join('');
  $('stats').innerHTML = data.attributes.map((key, index) => `<div class="stat">
    <div class="stat-label"><span>${data.labels[key]}<span class="stat-english" lang="en">${key}</span></span><strong id="stat-${key}"></strong></div>
    <progress id="bar-${key}" max="100" value="0" style="--stat-color:var(--${colors[index]})" aria-label="${data.labels[key]}评分"></progress></div>`).join('');
  $('legend').innerHTML = data.attributes.map((key, index) =>
    `<span><i class="dot" style="background:var(--${colors[index]})"></i>${data.labels[key]}</span>`).join('');
  $('team-tabs').innerHTML = data.teams.map((team, index) =>
    `<button class="team-button" data-team="${index}" aria-pressed="${index === 0}" aria-label="${escapeText(team.team)}，战力${team.power}">
      <span class="team-name">${escapeText(team.team)}</span><span class="team-value">${team.power}</span></button>`).join('');
}

function renderCard() {
  document.querySelectorAll('[data-base]').forEach(input => {input.value = base[input.dataset.base];});
  const used = Object.values(base).reduce((sum, value) => sum + value, 0);
  $('used').textContent = used;
  $('left').textContent = data.creationBudget - used;
  $('budget-bar').value = used;
  const stats = CreatorModel.attributes(data, base);
  for (const key of data.attributes) {
    $(`stat-${key}`).textContent = stats[key].toFixed(2);
    $(`bar-${key}`).value = stats[key];
  }
  $('role-badge').textContent = roleLabel(role);
  $('power').textContent = CreatorModel.contribution(data, stats, role).toFixed(4);
}

function contributionBar(sources, maximum, label) {
  const description = data.attributes.map(key => `${data.labels[key]} ${sources[key].toFixed(4)}`).join('，');
  return `<span class="contribution-bar" role="img" aria-label="${escapeText(label)}：${description}">` +
    data.attributes.map((key, index) => `<span style="width:${maximum ? sources[key] / maximum * 100 : 0}%;background:var(--${colors[index]})" title="${data.labels[key]} ${sources[key].toFixed(4)}"></span>`).join('') + '</span>';
}

function renderTeam(index) {
  const team = data.teams[index];
  const players = [...team.players].sort((a, b) => b.contribution - a.contribution);
  document.querySelectorAll('[data-team]').forEach(button => {button.setAttribute('aria-pressed', Number(button.dataset.team) === index);});
  $('team-name').textContent = team.team;
  $('team-power').textContent = team.power;
  const maximum = players[0].contribution;
  $('team-contributions').innerHTML = players.map(player => {
    const sources = CreatorModel.sources(data, player.attributes, player.role);
    return `<div class="player-contribution"><div class="contribution-row">
      <strong class="player-name">${escapeText(player.player)}</strong><span class="player-role">${roleLabel(player.role)}</span>
      ${contributionBar(sources, maximum, `${player.player}的七维战力贡献`)}<strong class="player-power">${player.contribution.toFixed(4)}</strong></div>
      <div class="source-values">` + data.attributes.map((key, index) =>
        `<span><i class="dot" style="background:var(--${colors[index]})"></i>${data.labels[key]} <b>${sources[key].toFixed(4)}</b></span>`).join('') + '</div></div>';
  }).join('');
  $('roster').innerHTML = `<thead><tr><th>选手</th><th>位置</th>${data.attributes.map(key => `<th>${data.labels[key]}</th>`).join('')}<th>战力贡献</th></tr></thead><tbody>` +
    players.map(player => `<tr><th scope="row">${escapeText(player.player)}</th><td>${roleLabel(player.role)}</td>` +
      data.attributes.map(key => `<td>${player.attributes[key]}</td>`).join('') + `<td>${player.contribution.toFixed(4)}</td></tr>`).join('') + '</tbody>';
}

$('base-inputs').addEventListener('input', event => {
  const input = event.target;
  const name = input.dataset.base;
  const requested = Math.floor(input.valueAsNumber || 0);
  const points = CreatorModel.allocate(data, base, name, requested);
  base[name] = points;
  $('feedback').textContent = points === requested ? '' : '已达到单项上限或剩余预算，可先减少其他属性。';
  renderCard();
});
$('role').addEventListener('change', () => {role = $('role').value; renderCard();});
$('average').addEventListener('click', () => {
  base = Object.fromEntries(baseNames.map(name => [name, data.creationBudget / baseNames.length]));
  $('feedback').textContent = '五项各16点，已分配80点。';
  renderCard();
});
$('clear').addEventListener('click', () => {
  base = Object.fromEntries(baseNames.map(name => [name, 0]));
  $('feedback').textContent = '已清空，可重新分配80点。';
  renderCard();
});
$('team-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-team]');
  if (button) renderTeam(Number(button.dataset.team));
});

build();
renderCard();
renderTeam(0);
