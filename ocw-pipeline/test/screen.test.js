import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleHtml } from '../src/screening/screen.js';

test('parseScheduleHtml: vererbt lec-Nummer vom Slides-Link an Video-Link derselben Session', () => {
  const html = `
    <table>
      <tr><th>Date</th><th>Topic</th></tr>
      <tr>
        <td>2/25</td>
        <td>
          Week 4 Foundation 3: Model architectures
          <a href="lec3%20-%20models.pdf">[slides]</a>
          <a href="https://youtu.be/V0gRkmu4mFY">[video]</a>
        </td>
      </tr>
    </table>
  `;

  const result = parseScheduleHtml(html, 'https://mit-mi.github.io/how2ai-course/spring2025/schedule/');
  const video = result.materials.find(material => material.media_type === 'youtube');
  const slides = result.materials.find(material => material.media_type === 'pdf');

  assert.equal(result.sessions, 1);
  assert.equal(result.slides, 1);
  assert.equal(result.videos, 1);
  assert.deepEqual(video.metadata.session_unit_numbers, [3]);
  assert.deepEqual(slides.metadata.session_unit_numbers, [3]);
  assert.deepEqual(video.metadata.session_slide_urls, [
    'https://mit-mi.github.io/how2ai-course/spring2025/schedule/lec3%20-%20models.pdf'
  ]);
});

test('parseScheduleHtml: verbindet getrennte Slides- und Video-Zeilen über session_key', () => {
  const html = `
    <table>
      <tr><th>Date</th><th>Topic</th></tr>
      <tr>
        <td>2/25</td>
        <td>
          Week 4 Foundation 3: Model architectures
          <a href="lec3%20-%20models.pdf">[slides]</a>
        </td>
      </tr>
      <tr>
        <td>2/25</td>
        <td>
          Week 4 Foundation 3: Model architectures
          <a href="https://youtu.be/V0gRkmu4mFY">[video]</a>
        </td>
      </tr>
    </table>
  `;

  const result = parseScheduleHtml(html, 'https://mit-mi.github.io/how2ai-course/spring2025/schedule/');
  const video = result.materials.find(material => material.media_type === 'youtube');

  assert.deepEqual(video.metadata.session_unit_numbers, [3]);
  assert.equal(video.metadata.session_key, '2 25 week 4 foundation 3 model architectures');
});

test('parseScheduleHtml: erzeugt kein künstliches Unit-Mapping ohne Lecture-Signal', () => {
  const html = `
    <table>
      <tr><th>Date</th><th>Topic</th></tr>
      <tr>
        <td>2/14</td>
        <td>
          Week 2 Foundation 2: Practical AI tools
          <a href="schedule/Debugging%20Tips.pdf">[slides]</a>
          <a href="https://youtu.be/NOSuy0NOe9k">[video]</a>
        </td>
      </tr>
    </table>
  `;

  const result = parseScheduleHtml(html, 'https://mit-mi.github.io/how2ai-course/spring2025/schedule/');
  const video = result.materials.find(material => material.media_type === 'youtube');

  assert.deepEqual(video.metadata.session_unit_numbers, []);
});
