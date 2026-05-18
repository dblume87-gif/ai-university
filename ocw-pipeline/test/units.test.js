import test from 'node:test';
import assert from 'node:assert/strict';
import { inferUnitNumbers } from '../src/curation/units.js';

test('inferUnitNumbers: findet "Lecture 7" im Titel', () => {
  const result = inferUnitNumbers({ title: 'Lecture 7: Photosynthesis' });
  assert.deepEqual(result, [7]);
});

test('inferUnitNumbers: erweitert Range "Lectures 5 and 6"', () => {
  const result = inferUnitNumbers({ title: 'Lectures 5 and 6 — Notes' });
  assert.deepEqual(result, [5, 6]);
});

test('inferUnitNumbers: erkennt "lec07" in Resource-Path', () => {
  const result = inferUnitNumbers({
    title: 'Slides',
    resource_path: '/courses/x/resources/lec07-photosynthesis/'
  });
  assert.deepEqual(result, [7]);
});

test('inferUnitNumbers: erkennt Problem Set Nummer bei Assignment-Parent', () => {
  const result = inferUnitNumbers({
    title: 'Problem Set 3',
    metadata_json: JSON.stringify({ parent_title: 'Assignments' })
  });
  assert.deepEqual(result, [3]);
});

test('inferUnitNumbers: erkennt Lecture Nummer aus Parent-Title', () => {
  const result = inferUnitNumbers({
    title: 'While Loops',
    source_url: 'https://www.youtube.com/watch?v=P-0w8xWcnDQ',
    metadata_json: JSON.stringify({ parent_title: 'Lecture 2 Video Solutions' })
  });
  assert.deepEqual(result, [2]);
});

test('inferUnitNumbers: erkennt MAS.S60 Unit aus Schedule Session Text', () => {
  const result = inferUnitNumbers({
    title: '[video]',
    source_url: 'https://youtu.be/V0gRkmu4mFY',
    metadata_json: JSON.stringify({
      session_text: '2/25 Week 4 Foundation 3: Model architectures [slides] [video]'
    })
  });
  assert.deepEqual(result, [3]);
});

test('inferUnitNumbers: nutzt explizite Session-Unit-Metadaten vom Scraper', () => {
  const result = inferUnitNumbers({
    title: '[video]',
    source_url: 'https://youtu.be/example',
    metadata_json: JSON.stringify({
      session_unit_numbers: [7]
    })
  });
  assert.deepEqual(result, [7]);
});

test('inferUnitNumbers: MAS.S60 Multimodal Sequenz folgt Lecture-Nummern', () => {
  const result = inferUnitNumbers({
    title: '[video]',
    source_url: 'https://youtu.be/kixc1mh55yY',
    metadata_json: JSON.stringify({
      session_text: '3/4 Week 5 Multimodal 1: Connections and alignment [slides] [video]'
    })
  });
  assert.deepEqual(result, [4]);
});

test('inferUnitNumbers: pset-Token ohne Nummer im Title liefert leeres Ergebnis', () => {
  // Die Assessment-Heuristik braucht eine explizite Nummer im Title.
  const result = inferUnitNumbers({
    title: 'Pset overview',
    metadata_json: JSON.stringify({ parent_title: 'Assignments' })
  });
  assert.deepEqual(result, []);
});

test('inferUnitNumbers: dedupliziert und sortiert nicht — nur unique positive Integers', () => {
  const result = inferUnitNumbers({
    title: 'Lecture 4',
    resource_path: '/courses/x/resources/lec04-foo/'
  });
  assert.deepEqual(result, [4]);
});

test('inferUnitNumbers: leere Range "Lectures 10 to 20" über 5 → nur Start+Ende', () => {
  // expandRange: bei Differenz > 5 wird kein vollständiger Range erzeugt
  const result = inferUnitNumbers({ title: 'Lectures 10 to 20' });
  assert.deepEqual(result, [10, 20]);
});

test('inferUnitNumbers: leerer Input → leeres Array', () => {
  const result = inferUnitNumbers({ title: 'Course overview' });
  assert.deepEqual(result, []);
});
