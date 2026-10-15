const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('./model.js');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8'));
const data = globalThis.CREATOR_DATA;
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, '../hltv/modeling/integer_baseline.json'), 'utf8'));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const average = Object.fromEntries(Object.keys(data.baseLabels).map(key => [key, 16]));
const zero = Object.fromEntries(Object.keys(data.baseLabels).map(key => [key, 0]));

assert.equal(data.creationBudget, 80);
assert.equal(data.baseLabels.Sniper, '狙击');
assert.ok(Object.values(data.openingLimits).every(value => value === 25));
assert.deepEqual(Object.values(model.attributes(data, average)), [16, 34.4, 26.4, 18.4, 34.4, 48, 28]);
assert.ok(Object.values(model.attributes(data, zero)).every(value => value === 0));
assert.equal(model.attributes(data, {...average, Sniper: 0}).Sniping, 0);
assert.equal(model.attributes(data, {...zero, Sniper: 25}).Sniping, 75);
assert.equal(model.allocate(data, zero, 'Aim', 40), 25);
assert.equal(model.allocate(data, zero, 'Aim', -1), 0);
assert.equal(model.allocate(data, average, 'Aim', 25), 16);
assert.equal(model.allocate(data, {...zero, Aim: 25, Reaction: 25, Support: 25}, 'Sniper', 25), 5);

// Check every single-point mapping and all five position contributions against the baseline.
for (const key of Object.keys(data.baseLabels)) {
  const stats = model.attributes(data, {...zero, [key]: 1});
  assert.deepEqual(stats, data.openingGains[key]);
  for (const role of data.roles) close(model.contribution(data, stats, role), baseline.opening_marginals[role][key]);
}
const averageTotal = data.roles.reduce((sum, role) => sum + model.contribution(data, model.attributes(data, average), role), 0);
close(averageTotal, 86.04324324324324);
assert.equal(Math.floor(averageTotal), 86);
const optimum = baseline.optimal_opening.cards.reduce((sum, card) =>
  sum + model.contribution(data, model.attributes(data, card.base), card.role), 0);
close(optimum, 104.86993243243244);
assert.equal(Math.floor(optimum), 104);

assert.equal(data.teams.length, 10);
assert.equal(new Set(data.teams.flatMap(team => team.players.map(player => player.player))).size, 50);
for (const team of data.teams) {
  const expected = baseline.teams.find(item => item.team === team.team);
  assert.equal(team.power, expected.base_power);
  assert.deepEqual(team.players.map(player => player.role), data.roles);
  let total = 0;
  for (const player of team.players) {
    const value = model.contribution(data, player.attributes, player.role);
    close(value, player.contribution);
    const sources = model.sources(data, player.attributes, player.role);
    const expectedPlayer = expected.contributions.find(part => part.player === player.player);
    for (const key of data.attributes) close(sources[key], expectedPlayer.sources[key]);
    close(Object.values(sources).reduce((sum, source) => sum + source, 0), value);
    total += value;
  }
  close(total, expected.unrounded_power);
  assert.equal(Math.floor(total), team.power);
}
console.log('PASS: 80-point budget, caps, creation ratings, five roles, average/optimal scores and all 50 pro-player contributions.');
