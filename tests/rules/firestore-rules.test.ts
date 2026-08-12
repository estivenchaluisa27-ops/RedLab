import { describe, it, expect, beforeAll, afterAll, beforeEach, skip } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

let testEnv: RulesTestEnvironment;

const PROJECT_ID = 'lab-redes-turnos';

const EMULATOR_PORT = Number(process.env.FIRESTORE_EMULATOR_PORT) || 8081;
const EMULATOR_HOST = '127.0.0.1';

const ADMIN_EMAIL = 'admin@test.com';
const PROF_EMAIL = 'prof@test.com';
const STUDENT_EMAIL = 'student@test.com';

const COURSE_ID = 'course-123';
const GROUP_ID = 'prof@test.com';
const OTHER_COURSE_ID = 'course-456';
const OTHER_GROUP_ID = 'otherprof@test.com';

const ADMIN_UID = 'admin-uid';
const PROF_UID = 'prof-uid';
const STUDENT_UID = 'student-uid';

const emulatorAvailable = await checkEmulator();

async function checkEmulator(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: EMULATOR_HOST, port: EMULATOR_PORT, path: '/', timeout: 2000 },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve(!body.includes('<html') && !body.includes('<!doctype'));
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => {
      resolve(false);
    });
  });
}

beforeAll(async () => {
  if (!emulatorAvailable) {
    console.log(`⚠️  Firestore emulator not running on localhost:${EMULATOR_PORT} — skipping rules tests`);
    console.log('   Start emulator with: npx firebase emulators:start --only firestore');
    return;
  }
  const rules = fs.readFileSync(path.join(PROJECT_ROOT, 'firestore.rules'), 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: EMULATOR_HOST,
      port: EMULATOR_PORT,
    },
  });
});

afterAll(async () => {
  if (emulatorAvailable && testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (!emulatorAvailable) {
    return;
  }
  await testEnv.clearFirestore();

  // Admin doc
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(`admins/${ADMIN_EMAIL}`).set({ role: 'admin' });
    await context.firestore().doc(`professors/${PROF_EMAIL}`).set({ name: 'Profesor Test' });
    await context.firestore().doc(`student_directory/${STUDENT_EMAIL}`).set({
      courseId: COURSE_ID,
      courseName: 'Curso Test',
      email: STUDENT_EMAIL,
      groupId: GROUP_ID,
      role: 'student',
    });
    // Real group doc (name used by rules)
    await context.firestore().doc(`courses/${COURSE_ID}/groups/${GROUP_ID}`).set({
      name: 'Grupo Test',
      leaderEmail: PROF_EMAIL,
    });
    // Course doc
    await context.firestore().doc(`courses/${COURSE_ID}`).set({
      professorEmail: PROF_EMAIL,
      name: 'Curso Test',
    });
    // Other course + group for spoofing tests
    await context.firestore().doc(`courses/${OTHER_COURSE_ID}`).set({
      professorEmail: 'otherprof@test.com',
      name: 'Otro Curso',
    });
    await context.firestore().doc(`courses/${OTHER_COURSE_ID}/groups/${OTHER_GROUP_ID}`).set({
      name: 'Otro Grupo',
      leaderEmail: 'otherprof@test.com',
    });
  });
});

describe('Firestore Rules — Security (P0-1, P0-2)', () => {
  if (!emulatorAvailable) {
    it.skip('Firestore emulator not available — start with: npx firebase emulators:start --only firestore', () => {});
    return;
  }
  // -------------------------------
  // P0-1: Spoofing prevention
  // -------------------------------
  it('Student CAN create reservation with correct courseId and groupName', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    const reservation = {
      date: '2026-08-15',
      hour: 10,
      status: 'pending',
      userId: STUDENT_UID,
      groupName: 'Grupo Test',
      courseId: COURSE_ID,
      attendanceDetail: null,
    };
    await assertSucceeds(
      student.firestore().collection('reservations').add(reservation)
    );
  });

  it('Student CANNOT create reservation with SPOOFED courseId', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    const reservation = {
      date: '2026-08-15',
      hour: 10,
      status: 'pending',
      userId: STUDENT_UID,
      groupName: 'Grupo Test',
      courseId: OTHER_COURSE_ID, // SPOOFED
      attendanceDetail: null,
    };
    await assertFails(
      student.firestore().collection('reservations').add(reservation)
    );
  });

  it('Student CANNOT create reservation with SPOOFED groupName', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    const reservation = {
      date: '2026-08-15',
      hour: 10,
      status: 'pending',
      userId: STUDENT_UID,
      groupName: 'Otro Grupo', // SPOOFED
      courseId: COURSE_ID,
      attendanceDetail: null,
    };
    await assertFails(
      student.firestore().collection('reservations').add(reservation)
    );
  });

  it('Student CANNOT create reservation with empty groupName', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    const reservation = {
      date: '2026-08-15',
      hour: 10,
      status: 'pending',
      userId: STUDENT_UID,
      groupName: '', // EMPTY
      courseId: COURSE_ID,
      attendanceDetail: null,
    };
    await assertFails(
      student.firestore().collection('reservations').add(reservation)
    );
  });

  it('Student CANNOT create reservation as another user', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    const reservation = {
      date: '2026-08-15',
      hour: 10,
      status: 'pending',
      userId: 'other-uid', // SPOOFED UID
      groupName: 'Grupo Test',
      courseId: COURSE_ID,
      attendanceDetail: null,
    };
    await assertFails(
      student.firestore().collection('reservations').add(reservation)
    );
  });

  // -------------------------------
  // P0-2: Scoped reads
  // -------------------------------
  it('Student CAN read their own course', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    await assertSucceeds(
      student.firestore().doc(`courses/${COURSE_ID}`).get()
    );
  });

  it('Student CANNOT read other course', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    await assertFails(
      student.firestore().doc(`courses/${OTHER_COURSE_ID}`).get()
    );
  });

  it('Professor CAN read approved reservations globally', async () => {
    const prof = testEnv.authenticatedContext(PROF_UID, { email: PROF_EMAIL });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 10,
        status: 'approved',
        userId: 'some-student',
        groupName: 'Grupo Test',
        courseId: COURSE_ID,
        attendanceDetail: 'present',
      });
      // Another course's approved reservation
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 11,
        status: 'approved',
        userId: 'other-student',
        groupName: 'Otro Grupo',
        courseId: OTHER_COURSE_ID,
        attendanceDetail: 'present',
      });
    });
    // Professor reads their own course approved
    await assertSucceeds(
      prof.firestore()
        .collection('reservations')
        .where('status', '==', 'approved')
        .where('courseId', '==', COURSE_ID)
        .get()
    );
    // Professor reads OTHER course approved (global occupancy)
    await assertSucceeds(
      prof.firestore()
        .collection('reservations')
        .where('status', '==', 'approved')
        .where('courseId', '==', OTHER_COURSE_ID)
        .get()
    );
  });

  it('Professor CAN read blocked reservations globally', async () => {
    const prof = testEnv.authenticatedContext(PROF_UID, { email: PROF_EMAIL });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 10,
        status: 'blocked',
        userId: 'ADMIN',
        groupName: '',
        courseId: COURSE_ID,
        attendanceDetail: null,
      });
    });
    await assertSucceeds(
      prof.firestore()
        .collection('reservations')
        .where('status', '==', 'blocked')
        .get()
    );
  });

  it('Professor CAN read pending reservations ONLY from their courses', async () => {
    const prof = testEnv.authenticatedContext(PROF_UID, { email: PROF_EMAIL });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      // Pending in their course
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 10,
        status: 'pending',
        userId: STUDENT_UID,
        groupName: 'Grupo Test',
        courseId: COURSE_ID,
        attendanceDetail: null,
      });
      // Pending in OTHER course
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 11,
        status: 'pending',
        userId: 'other-student',
        groupName: 'Otro Grupo',
        courseId: OTHER_COURSE_ID,
        attendanceDetail: null,
      });
    });
    // CAN read pending in their course
    await assertSucceeds(
      prof.firestore()
        .collection('reservations')
        .where('status', '==', 'pending')
        .where('courseId', '==', COURSE_ID)
        .get()
    );
    // CANNOT read pending in other course
    await assertFails(
      prof.firestore()
        .collection('reservations')
        .where('status', '==', 'pending')
        .where('courseId', '==', OTHER_COURSE_ID)
        .get()
    );
  });

  it('Student CAN read blocked reservations globally', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 10,
        status: 'blocked',
        userId: 'ADMIN',
        groupName: '',
        courseId: COURSE_ID,
        attendanceDetail: null,
      });
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 11,
        status: 'blocked',
        userId: 'ADMIN',
        groupName: '',
        courseId: OTHER_COURSE_ID,
        attendanceDetail: null,
      });
    });
    await assertSucceeds(
      student.firestore()
        .collection('reservations')
        .where('status', '==', 'blocked')
        .get()
    );
  });

  it('Student CAN read reservations from their own course (all statuses)', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 10,
        status: 'pending',
        userId: STUDENT_UID,
        groupName: 'Grupo Test',
        courseId: COURSE_ID,
        attendanceDetail: null,
      });
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 11,
        status: 'approved',
        userId: 'other-student',
        groupName: 'Grupo Test',
        courseId: COURSE_ID,
        attendanceDetail: 'present',
      });
    });
    await assertSucceeds(
      student.firestore()
        .collection('reservations')
        .where('courseId', '==', COURSE_ID)
        .get()
    );
  });

  it('Student CANNOT read reservations from other course (except blocked)', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 10,
        status: 'pending',
        userId: 'other-student',
        groupName: 'Otro Grupo',
        courseId: OTHER_COURSE_ID,
        attendanceDetail: null,
      });
    });
    await assertFails(
      student.firestore()
        .collection('reservations')
        .where('courseId', '==', OTHER_COURSE_ID)
        .where('status', '==', 'pending')
        .get()
    );
  });

  // -------------------------------
  // Admin permissions
  // -------------------------------
  it('Admin CAN create blocked reservations', async () => {
    const admin = testEnv.authenticatedContext(ADMIN_UID, { email: ADMIN_EMAIL });
    const reservation = {
      date: '2026-08-15',
      hour: 10,
      status: 'blocked',
      userId: 'ADMIN',
      createdAt: new Date().toISOString(),
    };
    await assertSucceeds(
      admin.firestore().collection('reservations').add(reservation)
    );
  });

  it('Admin CAN read all courses', async () => {
    const admin = testEnv.authenticatedContext(ADMIN_UID, { email: ADMIN_EMAIL });
    await assertSucceeds(admin.firestore().doc(`courses/${COURSE_ID}`).get());
    await assertSucceeds(admin.firestore().doc(`courses/${OTHER_COURSE_ID}`).get());
  });

  it('Student CAN delete their own pending reservation', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    let reservationRef;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 10,
        status: 'pending',
        userId: STUDENT_UID,
        groupName: 'Grupo Test',
        courseId: COURSE_ID,
        attendanceDetail: null,
      });
      reservationRef = ref;
    });
    await assertSucceeds(student.firestore().doc(`reservations/${reservationRef.id}`).delete());
  });

  it('Student CANNOT delete approved reservation', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    let reservationRef;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 10,
        status: 'approved',
        userId: STUDENT_UID,
        groupName: 'Grupo Test',
        courseId: COURSE_ID,
        attendanceDetail: 'present',
      });
      reservationRef = ref;
    });
    await assertFails(student.firestore().doc(`reservations/${reservationRef.id}`).delete());
  });

  it('Student CANNOT delete another student\'s pending reservation', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    let reservationRef;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 10,
        status: 'pending',
        userId: 'other-uid',
        groupName: 'Grupo Test',
        courseId: COURSE_ID,
        attendanceDetail: null,
      });
      reservationRef = ref;
    });
    await assertFails(student.firestore().doc(`reservations/${reservationRef.id}`).delete());
  });
});

describe('Firestore Rules — Bug fixes', () => {
  if (!emulatorAvailable) {
    it.skip('Firestore emulator not available', () => {});
    return;
  }
  it('currentStudentGroupName() resolves from real group doc, not student_directory', async () => {
    // This test verifies the fix for the latent bug where rules compared
    // groupName against student_directory.groupName (field that never existed).
    // The rules now dereference courses/{courseId}/groups/{groupId}.name
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    // student_directory has groupId = GROUP_ID ('prof@test.com')
    // The real group doc at courses/COURSE_ID/groups/GROUP_ID has name = 'Grupo Test'
    // Reservation with that exact name should succeed
    const reservation = {
      date: '2026-08-15',
      hour: 10,
      status: 'pending',
      userId: STUDENT_UID,
      groupName: 'Grupo Test', // Must match the group doc's name
      courseId: COURSE_ID,
      attendanceDetail: null,
    };
    await assertSucceeds(
      student.firestore().collection('reservations').add(reservation)
    );
  });

  // ----------------------------------------------------------------
  // Regression — student calendar listener (calendar.js:renderStudentCalendar)
  // After commit 91dfa12 hardened reservation read rules, the previous
  // single-listener query (date >= X && date <= Y without status/courseId)
  // returned permission-denied. The fix splits the listener into two
  // deterministic queries: blocked-only (global) and courseId-only (own course).
  // Each query must pass the rules independently.
  // ----------------------------------------------------------------

  it('Student CAN run blocked+date-range listener (calendar.js:studentBlocked)', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 10,
        status: 'blocked',
        userId: 'ADMIN',
        groupName: '',
        courseId: COURSE_ID,
        attendanceDetail: null,
      });
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 11,
        status: 'blocked',
        userId: 'ADMIN',
        groupName: '',
        courseId: OTHER_COURSE_ID,
        attendanceDetail: null,
      });
    });
    await assertSucceeds(
      student.firestore()
        .collection('reservations')
        .where('status', '==', 'blocked')
        .where('date', '>=', '2026-08-10')
        .where('date', '<=', '2026-08-20')
        .get()
    );
  });

  it('Student CAN run courseId+date-range listener (calendar.js:studentCourse)', async () => {
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 10,
        status: 'pending',
        userId: STUDENT_UID,
        groupName: 'Grupo Test',
        courseId: COURSE_ID,
        attendanceDetail: null,
      });
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 11,
        status: 'approved',
        userId: 'other-student',
        groupName: 'Grupo Test',
        courseId: COURSE_ID,
        attendanceDetail: 'present',
      });
    });
    await assertSucceeds(
      student.firestore()
        .collection('reservations')
        .where('courseId', '==', COURSE_ID)
        .where('date', '>=', '2026-08-10')
        .where('date', '<=', '2026-08-20')
        .get()
    );
  });

  it('Student CANNOT run the OLD query (date-range only without status/courseId)', async () => {
    // Regression guard: the original single listener used
    //   where date >= X && date <= Y
    // without any status/courseId filter, which is non-deterministic under
    // the hardened rules and must remain denied so we never regress to it.
    const student = testEnv.authenticatedContext(STUDENT_UID, { email: STUDENT_EMAIL });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('reservations').add({
        date: '2026-08-15',
        hour: 10,
        status: 'pending',
        userId: 'other-student',
        groupName: 'Otro Grupo',
        courseId: OTHER_COURSE_ID,
        attendanceDetail: null,
      });
    });
    await assertFails(
      student.firestore()
        .collection('reservations')
        .where('date', '>=', '2026-08-10')
        .where('date', '<=', '2026-08-20')
        .get()
    );
  });
});