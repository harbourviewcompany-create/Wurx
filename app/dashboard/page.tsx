'use client';

import { useEffect, useState } from 'react';

export default function Dashboard() {
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/jobs')
      .then(res => res.json())
      .then(setJobs);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Dashboard</h1>
      {jobs.map(job => (
        <div key={job.id} style={{ border: '1px solid #ccc', marginBottom: 10, padding: 10 }}>
          <h3>{job.title}</h3>
          <p>{job.description}</p>
          <button onClick={async () => {
            await fetch('/api/jobs/match', {
              method: 'POST',
              body: JSON.stringify({ jobId: job.id })
            });
            alert('Matched');
          }}>Auto Match</button>
        </div>
      ))}
    </div>
  );
}
