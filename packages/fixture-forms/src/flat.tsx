import { StrictMode, useState, type FormEvent, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// Single-page variant of the fixture used by the extension end-to-end suite:
// every field is visible at once so the acceptance flow can exercise the whole
// form without navigating between sections.
export function FlatApplication(): ReactElement {
  const [fullName, setFullName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [governmentId, setGovernmentId] = useState('');
  const [degree, setDegree] = useState('');
  const [graduationDate, setGraduationDate] = useState('');
  const [relocate, setRelocate] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="eyebrow">Akarna local fixture</p>
        <h1>Job application</h1>
        <p>Single-page form exercising native and React-controlled behaviors.</p>
      </header>
      <form aria-label="Job application form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Application</legend>

          <label htmlFor="full-name">Full name <span aria-hidden="true">*</span></label>
          <input id="full-name" name="fullName" type="text" required value={fullName} onChange={(event) => setFullName(event.target.value)} />

          <label htmlFor="preferred-name">Preferred name</label>
          <input id="preferred-name" name="preferredName" type="text" value={preferredName} onChange={(event) => setPreferredName(event.target.value)} />

          <label htmlFor="private-id">Government ID (private entry only)</label>
          <input id="private-id" name="governmentId" type="text" autoComplete="off" data-sensitive="true" value={governmentId} onChange={(event) => setGovernmentId(event.target.value)} />

          <label htmlFor="degree">Highest degree <span aria-hidden="true">*</span></label>
          <select id="degree" name="highestDegree" required value={degree} onChange={(event) => setDegree(event.target.value)}>
            <option value="">Choose a degree</option>
            <option value="high-school">High school</option>
            <option value="bachelors">Bachelor&#8217;s</option>
            <option value="masters">Master&#8217;s</option>
            <option value="doctorate">Doctorate</option>
          </select>

          <label htmlFor="graduation-date">Graduation date <span aria-hidden="true">*</span></label>
          <input id="graduation-date" name="graduationDate" type="date" required value={graduationDate} onChange={(event) => setGraduationDate(event.target.value)} />

          <label htmlFor="recruiter-code">Recruiter code</label>
          <input id="recruiter-code" name="recruiterCode" type="text" disabled readOnly value="Assigned by recruiter" />

          <label htmlFor="internal-routing" className="visually-hidden">Internal routing value</label>
          <input id="internal-routing" name="internalRouting" type="text" hidden readOnly value="internal-only" />

          <label>
            <input type="checkbox" name="relocate" required checked={relocate} onChange={(event) => setRelocate(event.target.checked)} /> Relocate
          </label>

          <button type="submit">Submit application</button>
        </fieldset>
        {submitted && <p role="status" className="success">Application submitted successfully.</p>}
      </form>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <FlatApplication />
    </StrictMode>,
  );
}
