import { StrictMode, useState, type FormEvent, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Section = 'profile' | 'education' | 'review';

export function FixtureApplication(): ReactElement {
  const [section, setSection] = useState<Section>('profile');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [degree, setDegree] = useState('');
  const [graduationDate, setGraduationDate] = useState('');
  const [workAuthorization, setWorkAuthorization] = useState('');
  const [sponsorshipDetails, setSponsorshipDetails] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');

  function goNext(): void {
    setServerError('');
    if (section === 'profile') setSection('education');
    else if (section === 'education') setSection('review');
  }

  function goBack(): void {
    setServerError('');
    if (section === 'education') setSection('profile');
    else if (section === 'review') setSection('education');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setServerError('');
    if (!termsAccepted) {
      setServerError('Please accept the terms before submitting this application.');
      return;
    }
    if (name.trim().toLowerCase() === 'server error') {
      setServerError('The application could not be submitted. Please review your answers and try again.');
      return;
    }
    setSubmitted(true);
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="eyebrow">Akarna local fixture</p>
        <h1>Job application</h1>
        <p>Use this page to exercise supported native and React-controlled form behaviors.</p>
      </header>
      <nav aria-label="Application progress" className="progress">
        <span className={section === 'profile' ? 'active' : ''}>1. Profile</span>
        <span className={section === 'education' ? 'active' : ''}>2. Education</span>
        <span className={section === 'review' ? 'active' : ''}>3. Review</span>
      </nav>
      <form aria-label="Job application form" onSubmit={handleSubmit}>
        {section === 'profile' && (
          <fieldset>
            <legend>Profile</legend>
            <label htmlFor="full-name">Full name <span aria-hidden="true">*</span></label>
            <input id="full-name" name="fullName" type="text" required value={name} onChange={(event) => setName(event.target.value)} />
            <label htmlFor="email">Email address <span aria-hidden="true">*</span></label>
            <input id="email" name="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            <label htmlFor="phone">Phone number</label>
            <input id="phone" name="phone" type="tel" />
            <label htmlFor="portfolio">Portfolio URL</label>
            <input id="portfolio" name="portfolio" type="url" placeholder="Optional" />
            <label htmlFor="disabled-field">Recruiter code</label>
            <input id="disabled-field" name="recruiterCode" type="text" disabled value="Assigned by recruiter" readOnly />
            <label htmlFor="hidden-field" className="visually-hidden">Internal routing value</label>
            <input id="hidden-field" name="internalRouting" type="text" hidden value="internal-only" readOnly />
            <label htmlFor="private-id">Government ID (private entry only)</label>
            <input id="private-id" name="governmentId" type="text" autoComplete="off" data-sensitive="true" />
            <button type="button" onClick={goNext}>Next: Education</button>
          </fieldset>
        )}
        {section === 'education' && (
          <fieldset>
            <legend>Education and work authorization</legend>
            <label htmlFor="degree">Highest degree <span aria-hidden="true">*</span></label>
            <select id="degree" name="highestDegree" required value={degree} onChange={(event) => setDegree(event.target.value)}>
              <option value="">Choose a degree</option>
              <option value="high-school">High school</option>
              <option value="bachelors">Bachelor&apos;s</option>
              <option value="masters">Master&apos;s</option>
              <option value="doctorate">Doctorate</option>
            </select>
            <label htmlFor="graduation-date">Graduation date <span aria-hidden="true">*</span></label>
            <input id="graduation-date" name="graduationDate" type="date" required value={graduationDate} onChange={(event) => setGraduationDate(event.target.value)} />
            <label htmlFor="years-experience">Years of experience</label>
            <input id="years-experience" name="yearsExperience" type="number" min="0" max="60" />
            <label>Work authorization <span aria-hidden="true">*</span></label>
            <div className="radio-group">
              <label><input type="radio" name="workAuthorization" value="authorized" required checked={workAuthorization === 'authorized'} onChange={(event) => setWorkAuthorization(event.target.value)} /> Authorized to work</label>
              <label><input type="radio" name="workAuthorization" value="needs-sponsorship" checked={workAuthorization === 'needs-sponsorship'} onChange={(event) => setWorkAuthorization(event.target.value)} /> Will need sponsorship</label>
            </div>
            {workAuthorization === 'needs-sponsorship' && (
              <div className="conditional-field">
                <label htmlFor="sponsorship-details">Sponsorship details <span aria-hidden="true">*</span></label>
                <textarea id="sponsorship-details" name="sponsorshipDetails" required value={sponsorshipDetails} onChange={(event) => setSponsorshipDetails(event.target.value)} />
              </div>
            )}
            <div className="button-row"><button type="button" className="secondary" onClick={goBack}>Back</button><button type="button" onClick={goNext}>Next: Review</button></div>
          </fieldset>
        )}
        {section === 'review' && (
          <fieldset>
            <legend>Review and submit</legend>
            <dl className="summary"><div><dt>Full name</dt><dd>{name || 'Not provided'}</dd></div><div><dt>Email</dt><dd>{email || 'Not provided'}</dd></div><div><dt>Highest degree</dt><dd>{degree || 'Not provided'}</dd></div><div><dt>Graduation date</dt><dd>{graduationDate || 'Not provided'}</dd></div></dl>
            <label><input type="checkbox" name="terms" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /> I confirm my answers are accurate.</label>
            <div className="button-row"><button type="button" className="secondary" onClick={goBack}>Back</button><button type="submit">Submit application</button></div>
            {serverError && <p role="alert" className="error">{serverError}</p>}
            {submitted && <p role="status" className="success">Application submitted successfully.</p>}
          </fieldset>
        )}
      </form>
    </main>
  );
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('root');

  if (root) {
    createRoot(root).render(
      <StrictMode>
        <FixtureApplication />
      </StrictMode>,
    );
  }
}
