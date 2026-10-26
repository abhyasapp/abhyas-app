// tests/admin-access.test.js — the Admins screen must show what each admin may do.
//
// The Supabase backend sends the admin list with raw permission keys and no `labels`. The screen used to
// build its permission checkboxes from those labels, so the editor opened to nothing but Save / Cancel
// and the row listed raw keys like "users_view". The names now have a built-in copy and are also sent
// by the server.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const ADMINS = [
  { username: 'sub1', role: 'admin', createdBy: 'admin', permissions: ['dashboard', 'users_view', 'payments_view', 'payments_review', 'logs_view'] },
  { username: 'sub2', role: 'admin', createdBy: 'admin', permissions: [] },
  { username: 'admin', role: 'owner', createdBy: 'system', permissions: ['dashboard'] }
];

describe('admins screen', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'admin.html', { waitMs: 800 }); }, 120000);
  afterAll(() => p && p.close());

  const render = (labels) => p.ev(`(() => {
    ADMIN.creds = { user: 'admin' };
    ADMINS._labels = {};
    ADMINS.render(${JSON.stringify(ADMINS)}, true, ${JSON.stringify(labels)});
    const rows = [...document.querySelectorAll('#admins-list .row')];
    return rows.map(r => ({
      name: r.querySelector('.row-title').childNodes[0].textContent.trim(),
      pills: [...r.querySelectorAll('.perm-pill')].map(x => x.textContent),
      sub: r.querySelector('.row-sub').textContent.trim(),
      boxes: r.querySelectorAll('.perm-row input').length,
      checked: [...r.querySelectorAll('.perm-row input:checked')].map(i => i.dataset.feat)
    }));
  })()`);

  it('lists what an admin can do in plain English even when the server sends no labels', () => {
    const rows = render({});
    const sub1 = rows.find((r) => r.name === 'sub1');
    expect(sub1.pills).toEqual(['Dashboard overview', 'View users list', 'View payments list', 'Verify / reject payments', 'View activity logs']);
    expect(sub1.pills.join(' ')).not.toMatch(/users_view|payments_view/);
    expect(sub1.sub).toContain('5 of 24 permissions');
  });

  it('the permission editor lists every grantable permission and ticks the granted ones', () => {
    const rows = render({});
    const sub1 = rows.find((r) => r.name === 'sub1');
    expect(sub1.boxes).toBe(24);
    expect(sub1.checked.sort()).toEqual(['dashboard', 'logs_view', 'payments_review', 'payments_view', 'users_view']);
  });

  it('says so plainly when an admin has no access yet', () => {
    const sub2 = render({}).find((r) => r.name === 'sub2');
    expect(sub2.pills).toEqual(['No access granted yet']);
    expect(sub2.boxes).toBe(24);
    expect(sub2.checked).toEqual([]);
  });

  it('the owner row shows full access and no editor', () => {
    const owner = render({}).find((r) => r.name === 'admin');
    expect(owner.pills).toEqual([]);
    expect(owner.sub).toContain('full access');
    expect(owner.boxes).toBe(0);
  });

  it('the "Add an admin" dialog also lists every permission', () => {
    p.ev("ADMINS._labels = {}; ADMINS.openPromote()");
    expect(p.ev("document.querySelectorAll('#promote-perms .perm-row input').length")).toBe(24);
    expect(p.ev("document.querySelector('#promote-perms').textContent")).toContain('Verify / reject payments');
  });

  it('server-sent labels win over the built-in names', () => {
    const sub1 = render({ users_view: 'See the student list' }).find((r) => r.name === 'sub1');
    expect(sub1.pills).toContain('See the student list');
    expect(sub1.pills).toContain('Dashboard overview');
  });
});
