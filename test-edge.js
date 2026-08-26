// Test Edge Function with real token
const token = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkNBdXdPcWRMN2YyXzlhTVhZX3ZkbEcyVENXbVV4aklXV1MwNVB4WHljcUkiLCJ0eXAiOiJKV1QifQ.eyJhdWQiOiI2NDU3ZmExNy0xMjI0LTQxNmEtYjIxYS1lZTZjZTc2ZTliYzAiLCJpc3MiOiJodHRwczovL2xvZ2luLmxhbGlnYS5lcy8zMzUzMTZlYi1mNjA2LTQzNjEtYmI4Ni0zNWE3ZWRjZGNlYzEvdjIuMC8iLCJleHAiOjE3ODcwNzY0ODgsIm5iZiI6MTc4Njk5MDA4OCwiaWRwIjoiZ29vZ2xlLmNvbSIsImlzQWN0dWFsVmVyc2lvbiI6dHJ1ZSwiY29ycmVsYXRpb25JZCI6IjVhOWRkMTA1LWNhY2UtNGQ4Yi1iMDhhLTE1MGIyZGJjYTlkOCIsInRpZCI6IjMzNTMxNmViLWY2MDYtNDM2MS1iYjg2LTM1YTdlZGNkY2VjMSIsImxhIjoiZXMtRVMiLCJlbWFpbCI6InNvdGlsbGE5OUBnbWFpbC5jb20iLCJnaXZlbl9uYW1lIjoiSmF2aWVyIiwiZmFtaWx5X25hbWUiOiJNYXLDrW4iLCJuYW1lIjoiR29vZ2xlIHVzZXIiLCJzdWIiOiI2NjVlOWVlOS1mYThhLTQwYzEtYTA3Zi0zNjNmYjAyZTY5ZjQiLCJvdGhlck1haWxzIjpbInNvdGlsbGE5OUBnbWFpbC5jb20iXSwiZXh0ZW5zaW9uX1VzZXJQcm9maWxlSWQiOiJkNmE3MmE1Yy1kNzUxLTRlOTEtOWQxMS00NTU4ZWI4NTk0NjkiLCJvaWQiOiJkNmE3MmE1Yy1kNzUxLTRlOTEtOWQxMS00NTU4ZWI4NTk0NjkiLCJleHRlbnNpb25fRW1haWxWZXJpZmllZCI6ZmFsc2UsIm5ld1VzZXIiOmZhbHNlLCJoYXNQZW5kaW5nQ29uc2VudHMiOnRydWUsIm5vbmNlIjoiZGVmYXVsdE5vbmNlIiwiYXpwIjoiNjQ1N2ZhMTctMTIyNC00MTZhLWIyMWEtZWU2Y2U3NmU5YmMwIiwidmVyIjoiMS4wIiwiaWF0IjoxNzg2OTkwMDg4fQ.UDoO965ibp6jDVkIB9VtlMRnc2IDOA8wsIKUlPaFflOuoRaI5x9tYdtUzNkdb1WtfZhrlcLVuLFgsadeClot3u4yywO1ObRt65f1sDfT8bRZK76A3JUip0UXJD-lfB6vQedQhjatVGolEtRN6zd6baethyXBYMFLKhtrrL-bfNxd2l60KtAmIrIs1-vnbnJB55Bi5xsmiB2ofGCWQlW0-sXqxU0S-kbO66nWqduXx8-cAgxlXpO-jIvcxKEReQEyPrVmPafiQbKJeZV_zlK4lRVwSsLFdwyrbHwQidvbsmm-NYwdn9smxNBDVAne2QR44XaJzooU54Q-0WSdKwU7cw';

async function test() {
  // Test via Edge Function
  const res1 = await fetch('https://swydfexrasfbjmvtotvr.supabase.co/functions/v1/laliga-api/v1/competition/1/player/3149/league/018030602?x-lang=es', {
    headers: {
      'apikey': 'sb_publishable_47mZM3tmpXk6svBslFFAQA_VVt8lR7p',
      'Authorization': 'Bearer sb_publishable_47mZM3tmpXk6svBslFFAQA_VVt8lR7p',
      'x-laliga-token': token,
    }
  });
  console.log('Edge Function Status:', res1.status);
  const body1 = await res1.text();
  console.log('Edge Function Body:', body1.slice(0, 300));

  // Test via old proxy
  const res2 = await fetch('http://localhost:3005/api/v1/competition/1/player/3149/league/018030602?x-lang=es', {
    headers: {
      'Content-Type': 'application/json',
      'x-lang': 'es',
      'Authorization': `Bearer ${token}`,
    }
  });
  console.log('Old Proxy Status:', res2.status);
  const body2 = await res2.text();
  console.log('Old Proxy Body:', body2.slice(0, 300));
}

test();
