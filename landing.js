
const form = document.getElementById('intakeForm');
const submitBtn = document.getElementById('submitBtn');
form.addEventListener('submit', async function(e) {
  e.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';
  var fd = new FormData(form);
  var smsConsent = document.getElementById('smsConsent').checked;
  // The SMS consent checkbox is intentionally optional. If unchecked, the lead may submit the form but should be excluded from SMS follow-up.
  fd.append('sms_consent', smsConsent ? 'true' : 'false');
  fd.append('sms_consent_timestamp', new Date().toISOString());
  fd.append('source', 'Landing Page — Contact Form');
  try {
    await fetch('https://hook.us2.make.com/yva8wlu9q65s6l8fj0dq2gd4rwqrpoce', { method: 'POST', body: fd });
  } catch(err) {}
  form.reset();
  // Show the dark navy modal in success state
  var photo = document.getElementById('hero-headshot');
  if (photo) document.getElementById('contactModalPhoto').src = photo.src;
  document.getElementById('contactFormWrap').style.display = 'none';
  document.getElementById('contactSuccess').style.display  = 'block';
  document.getElementById('contactModal').style.display    = 'flex';
});



function openContactModal() {
  var photo = document.getElementById('hero-headshot');
  if (photo) document.getElementById('contactModalPhoto').src = photo.src;
  document.getElementById('contactModal').style.display = 'flex';
  document.getElementById('contactFormWrap').style.display = 'block';
  document.getElementById('contactSuccess').style.display = 'none';
  document.getElementById('cSubmitBtn').disabled = false;
  document.getElementById('cSubmitBtn').textContent = 'Get a Call Back →';
}
async function submitContactModal() {
  var name  = document.getElementById('cName').value.trim();
  var phone = document.getElementById('cPhone').value.trim();
  var email = document.getElementById('cEmail').value.trim();
  var lang  = document.getElementById('cLang').value;
  if (!name || !phone || !email) { alert('Please fill in all required fields.'); return; }
  var btn = document.getElementById('cSubmitBtn');
  btn.disabled = true; btn.textContent = 'Sending…';
  var fd = new FormData();
  fd.append('name', name); fd.append('phone', phone);
  fd.append('email', email); fd.append('language', lang);
  fd.append('source', 'Landing Page — Get Started');
  try {
    await fetch('https://hook.us2.make.com/yva8wlu9q65s6l8fj0dq2gd4rwqrpoce', { method:'POST', body: fd });
    document.getElementById('contactFormWrap').style.display = 'none';
    document.getElementById('contactSuccess').style.display  = 'block';
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Get a Call Back →';
    alert('Something went wrong. Please call (520) 971-0603 directly.');
  }
}
