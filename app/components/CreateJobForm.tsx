'use client';
import { useState } from 'react';

export default function CreateJobForm() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const submit = async () => {
    await fetch('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ title, description, userId: 'demo-user' })
    });
    window.location.reload();
  };

  return (
    <div>
      <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
      <input placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
      <button onClick={submit}>Create Job</button>
    </div>
  );
}