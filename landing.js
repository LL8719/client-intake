
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



/* ── Google Reviews carousel ──
   Real Google reviews (light excerpting where Google truncated). */
var REVIEWS = [
  {
    text: 'Luis was very helpful and knowledgeable about the whole process. He made sure I understood every step along the way in a simple and caring manner. Highly recommend Luis!',
    name: 'Liz Castruita'
  },
  {
    text: 'My experience with you, Luis, was the best. Thanks to you and your team for all the help you gave us. You guys are the best! Thank you!',
    name: 'Yesenia Padilla'
  },
  {
    text: 'Luis did an awesome job, he was really helpful and explained everything in detail during the whole process. I really recommend them and Luis.',
    name: 'Vanessa Quezada'
  },
  {
    text: 'First time home buyer!!! We had an excellent experience working with Luis. From the very beginning, he was professional, responsive, and always willing to help. He made everything easy.',
    name: 'Gilberto Felix'
  },
  {
    text: 'Luis is an amazing person to work with. Helped me out through the whole process. I will definitely work with Luis again on next purchase. I highly recommend working with Luis.',
    name: 'Junior Pina'
  },
  {
    text: 'Very grateful first of all to God for allowing me to fulfill my dream of having our little house, and thank Luis López because he was there in the whole process. Very kind — thank you all for your help, may God bless you.',
    name: 'Lourdes Rodriguez'
  },
  {
    text: 'Couldn\'t have asked for anyone better to have been in my corner through this experience. Luis was absolutely amazing. Communicated great and was very knowledgeable about the resources available to assist in my first home buying. Have a client and friend for life!!!',
    name: 'Jaclyn Miller'
  },
  {
    text: 'I recently had the pleasure of working with Luis as my loan officer for my purchase loan, and I couldn\'t be more satisfied with the experience. Luis kept me informed throughout the entire process, guiding me through every step.',
    name: 'Victor Vasquez'
  },
  {
    text: 'I had the pleasure of working with Luis on a recent buyer transaction, and I can\'t recommend him highly enough. He is extremely knowledgeable, transparent, and efficient throughout the entire process.',
    name: 'Jessica Duenas'
  },
  {
    text: 'Being a first time home buyer I was fortunate enough to be introduced to Mr. Luis with Ink Mortgage Pro. Luis made the process of obtaining a home loan a breeze. I can\'t thank him and his team enough. I would recommend them ten times out of ten!',
    name: 'Josh Alderete'
  }
];

(function () {
  var body  = document.getElementById('reviewBody');
  var quote = document.getElementById('reviewQuote');
  var name  = document.getElementById('reviewName');
  var dots  = document.getElementById('reviewDots');
  if (!body || !quote || !name || !dots || !REVIEWS.length) return;

  var current = 0;
  var timer = null;

  REVIEWS.forEach(function (_, i) {
    var dot = document.createElement('button');
    dot.className = 'review-dot';
    dot.type = 'button';
    dot.setAttribute('aria-label', 'Show review ' + (i + 1));
    dot.addEventListener('click', function () { show(i); restartTimer(); });
    dots.appendChild(dot);
  });

  function render(i) {
    quote.textContent = '“' + REVIEWS[i].text + '”';
    name.textContent = REVIEWS[i].name;
    var allDots = dots.children;
    for (var d = 0; d < allDots.length; d++) {
      allDots[d].classList.toggle('active', d === i);
    }
  }

  function show(i) {
    if (i === current) { render(i); return; }
    current = i;
    body.style.opacity = '0';
    setTimeout(function () { render(i); body.style.opacity = '1'; }, 300);
  }

  function restartTimer() {
    clearInterval(timer);
    timer = setInterval(function () { show((current + 1) % REVIEWS.length); }, 6500);
  }

  render(0);
  restartTimer();
})();

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
