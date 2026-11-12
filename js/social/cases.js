// Operation Ghost: the five social-engineering investigations and CIPHER's
// final "Trust Network" analysis, as declarative data plus small checkers.
// Each case goes OBSERVE → TALK → INSPECT EVIDENCE → DECIDE → LEARN, and uses
// its own kind of evidence analysis. The technique's name is only revealed in
// LEARN. All people, companies, numbers and domains are fictional
// (*.example domains, 555 numbers).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPSocial = root.HTPSocial || {}).Cases = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CASES = [
    {
      id: 'coco', file: '01', npc: 'COCO', role: 'TOURIST', location: 'MIAMI BEACH',
      technique: 'BAITING', palette: ['#F58FC4', '#F3BC75'],
      objective: 'Find out what the beach offer is really after.',
      observe: {
        text: 'COCO waves a glossy card at the beach bar: "FREE VIP CABANA + unlimited eSIM data — scan to claim". A promoter handed out a stack and left. Three tourists nearby are already scanning.',
        signal: 'Campaign telemetry: the same offer reached 400 phones in 3 minutes, in six languages, each message greeting the reader by first name.',
        evidence: 'flyer',
      },
      talk: [
        { ask: 'What exactly do you get?', reply: '"A cabana all week and free roaming data! I just sign in to confirm I\'m eligible. It even takes my work account — handy, I\'m here for the Synapse conference."', evidence: 'signin' },
        { ask: 'Who gave you the card?', reply: '"A promoter in a resort polo. Super friendly, perfect English and Portuguese. He said the offer ends at sunset, so I should hurry."', evidence: 'promoter' },
        { ask: 'Did anything come with it?', reply: '"This little charging stick! You plug it into your laptop to activate the eSIM. Cute, right?"', evidence: 'stick' },
      ],
      evidence: {
        flyer: { kind: 'FLYER', title: 'Promo card', lines: ['FREE VIP CABANA · ALL WEEK', 'Unlimited eSIM data for conference guests', 'Scan: cabana-vip-claim.example', 'Offer ends at sunset'] },
        signin: { kind: 'WEB PAGE', title: 'Claim page', lines: ['"Sign in with your WORK account to confirm eligibility"', 'Asks for: work email, password, and the MFA code sent to your phone', 'Domain cabana-vip-claim.example — not the resort\'s site'] },
        promoter: { kind: 'CHECK', title: 'Resort staff list', lines: ['No promoter is on today\'s resort staff list', 'The resort\'s official site lists no cabana giveaway', 'Message was fluent and personalised — no spelling errors'] },
        stick: { kind: 'DEVICE', title: '"eSIM activator" stick', lines: ['USB stick labelled ACTIVATE eSIM', 'Autoruns activator.exe and asks for administrator rights', 'eSIM profiles are installed from the phone, not from a laptop'] },
      },
      inspect: {
        type: 'bait',
        prompt: 'Separate the lure from the price. Pick the bait, then every item that is the real cost to COCO.',
        lure: {
          question: 'What is the bait?',
          options: [
            { id: 'gift', text: 'A free VIP cabana and unlimited data' },
            { id: 'deadline', text: 'The sunset deadline' },
            { id: 'qr', text: 'The QR code itself' },
            { id: 'polo', text: 'The promoter\'s resort polo' },
          ],
          answer: 'gift',
          hint: 'The bait is what makes her want to act. The deadline and the polo push or reassure — they are not the prize.',
        },
        cost: {
          question: 'What does it cost her? (select all that apply)',
          options: [
            { id: 'creds', text: 'Her work password and MFA code' },
            { id: 'admin', text: 'Admin rights on her laptop for an unknown program' },
            { id: 'name', text: 'Her first name' },
            { id: 'photo', text: 'A beach photo' },
          ],
          answer: ['creds', 'admin'],
          hint: 'Look at what the claim page and the stick ask for. Her first name was already in the message.',
        },
      },
      decide: {
        prompt: 'COCO is about to scan and plug in. What should she do?',
        options: [
          { id: 'a', text: 'Scan it on her personal phone instead — it is safer than a work device.', ok: false, outcome: 'The page still asks for her WORK login and MFA code. Changing the device does not change what the lure collects.' },
          { id: 'b', text: 'Don\'t scan or plug anything in. Check the offer with the resort using the number on its official site, and report the card to her company\'s security team.', ok: true, outcome: 'COCO calls the resort: there is no giveaway. Her security team blocks the claim domain for every Synapse guest.' },
          { id: 'c', text: 'Plug the stick in, but don\'t type any password.', ok: false, outcome: 'The stick runs a program with admin rights the moment it is plugged in. Unknown media is the risk itself, password or not.' },
          { id: 'd', text: 'Ask the promoter for his staff ID before scanning.', ok: false, outcome: 'An ID shown by the person running the lure proves nothing. Verify the offer with the resort, through a channel you find yourself.' },
        ],
      },
      learn: {
        happened: 'An attractive free offer was the lure to collect work credentials and to get code running on a corporate laptop.',
        evidence: 'A look-alike claim domain, a work sign-in plus MFA request, an "activator" that wants admin rights, and a sunset deadline.',
        risk: 'Takeover of a conference attendee\'s work account and malware on a company laptop.',
        control: 'Treat unsolicited offers, QR codes and unknown USB media as untrusted. Verify offers through the venue\'s official channel and report the lure.',
        ai: 'The messages were fluent and personalised at scale by automation. Polish and personal touches are not proof of origin.',
        verify: 'Check the domain and the sender before scanning or logging in; ask the company through a channel you already know. A gift and a deadline together are a reason to slow down.',
      },
      intel: 'Lure campaign aimed at conference guests: the claim page harvests work logins and MFA codes; a USB "activator" installs malware.',
    },
    {
      id: 'marcus', file: '02', npc: 'MARCUS', role: 'EXECUTIVE', location: 'DOWNTOWN OFFICE',
      technique: 'IMPERSONATION', palette: ['#1d2540', '#F3BC75'],
      objective: 'Check who MARCUS is about to let into Quanta Tower.',
      observe: {
        text: 'MARCUS paces outside QUANTA TOWER. A man with a lanyard waits beside him: "Rafael Ortiz, VaultLine Audits — here for the firewall review before the 3 PM board meeting." Marcus is reaching for his badge to let him in.',
        signal: 'Marcus received a voice note in his CFO\'s voice approving the visit ten minutes ago.',
        evidence: 'claim',
      },
      talk: [
        { ask: 'Who scheduled the audit?', reply: '"The CFO, apparently. Ana sent me a voice note — it sounds exactly like her. Here, listen."', evidence: 'voice' },
        { ask: 'Can I see his credentials?', reply: '"He showed me his badge and his profile. Five hundred connections, glowing endorsements. Looks legit."', evidence: 'profile' },
        { ask: 'Is he in the visitor system?', reply: '"I… didn\'t check. The lobby screen lists today\'s approved visitors. And our vendor directory is on my phone."', evidence: 'visitors' },
      ],
      evidence: {
        claim: { kind: 'IDENTITY', title: 'What the visitor says', lines: ['Name: Rafael Ortiz', 'Company: VaultLine Audits — "senior firewall auditor"', 'Printed badge on a lanyard', 'Phone in his email signature: +1 305 555 0142'] },
        voice: { kind: 'VOICE NOTE', title: '"CFO — Ana Reyes" · 0:14', lines: ['"Hi Marcus, it\'s Ana — let Rafael in, it\'s approved. No need to bother security."', 'Sent from +1 786 555 0199 — not Ana\'s number in the company directory', '◉ Synthetic-voice indicator: the voice matches public interviews, the channel does not'] },
        profile: { kind: 'PROFILE', title: 'Online profile', lines: ['Created three weeks ago', '500+ connections, endorsements all from accounts created the same week', 'Polished photo and work history — nothing that can be checked independently'] },
        visitors: { kind: 'RECORD', title: 'Visitor log + vendor directory', lines: ['Approved visitors today: Lin (HVAC, 09:30), Okafor (catering, 11:00) — no VaultLine visit', 'Vendor directory: VaultLine Audits IS an approved vendor', 'VaultLine\'s registered number: +1 305 555 0100 (not the one in his signature)', 'Marcus\'s calendar: board meeting 15:00 — confirmed'] },
      },
      inspect: {
        type: 'fields',
        prompt: 'An identity is a bundle of claims. Mark each statement as VERIFIED (backed by a record you trust) or CLAIMED (only the visitor, or his own material, says so).',
        labels: ['VERIFIED', 'CLAIMED'],
        items: [
          { id: 'vendor', text: 'VaultLine Audits is an approved vendor', answer: 'VERIFIED' },
          { id: 'employee', text: 'Rafael Ortiz works for VaultLine', answer: 'CLAIMED' },
          { id: 'visit', text: 'An audit is scheduled for today', answer: 'CLAIMED' },
          { id: 'cfo', text: 'The CFO approved the visit', answer: 'CLAIMED' },
          { id: 'phone', text: 'The number in his signature belongs to VaultLine', answer: 'CLAIMED' },
          { id: 'meeting', text: 'There is a board meeting at 3 PM', answer: 'VERIFIED' },
        ],
        hint: 'Ask of each line: which record that YOU trust confirms it? The badge, the profile and the voice note all come from the visitor\'s side.',
      },
      decide: {
        prompt: 'Rafael is waiting at the turnstile. What does Marcus do?',
        options: [
          { id: 'a', text: 'Let him in — the CFO\'s own voice approved it.', ok: false, outcome: 'A familiar voice is no longer proof: it came from a number outside the directory and asked him to skip security.' },
          { id: 'b', text: 'Call VaultLine on the number in the vendor directory and the CFO on her known extension. Until both confirm, Rafael waits in the lobby with a visitor escort.', ok: true, outcome: 'VaultLine has never heard of Rafael Ortiz, and Ana sent no voice note. Building security takes it from there.' },
          { id: 'c', text: 'Call the number in his email signature to confirm.', ok: false, outcome: 'That number is part of his claim and may ring an accomplice. Verify with a contact you already trust.' },
          { id: 'd', text: 'Quiz him on firewalls to see if he really is an auditor.', ok: false, outcome: 'Expertise can be studied — or generated on the fly. It does not prove who employs him.' },
        ],
      },
      learn: {
        happened: 'Someone posed as a trusted vendor\'s auditor, backed by a cloned-voice "approval" and a fabricated profile, to be badged onto the board floor.',
        evidence: 'No visit in the log, a signature number that differs from the vendor directory, a three-week-old profile, and a voice note from a number outside the directory.',
        risk: 'Physical access to the board floor and its network — and the CFO\'s voice reused to approve other requests.',
        control: 'Verify identity and authority through an independent, trusted channel (directory or contract contact, known extension). Register and escort visitors; no tailgating.',
        ai: 'A synthetic voice and a generated profile made the claim convincing. Convincing is not the same as verified.',
        verify: 'Call back on a number from the company directory, not one in the message. Payment or credential requests from executives go through the normal approval path, however urgent.',
      },
      intel: 'Fake "VaultLine auditor" backed by a cloned CFO voice note sent from +1 786 555 0199.',
    },
    {
      id: 'rico', file: '03', npc: 'RICO', role: 'CLUB DOORMAN', location: 'CLUB NEON',
      technique: 'PRETEXTING', palette: ['#121629', '#F58FC4'],
      objective: 'Read the order RICO just received.',
      observe: {
        text: 'RICO holds the velvet rope with one hand and his phone with the other, frowning. "Head of security says there\'s a threat inside. He wants the service door open at nine for a quiet sweep."',
        signal: 'The thread copies the security chief\'s sign-off and nicknames — all visible in his public posts.',
        evidence: 'thread',
      },
      talk: [
        { ask: 'Who sent this?', reply: '"Vega Security. That\'s what my phone shows, see? First time he\'s texted me, normally it\'s the radio."', evidence: 'sender' },
        { ask: 'What does he want you to do?', reply: '"Unlock the service door at nine, kill the north-door cameras for ten minutes, and not call upstairs — he says the threat could be listening."', evidence: 'request' },
        { ask: 'What\'s the normal procedure?', reply: '"Any door or camera change comes from the security office, on the desk radio. Always. It\'s on the card by the door."', evidence: 'procedure' },
      ],
      evidence: {
        thread: { kind: 'MESSAGES', title: 'Thread from "Vega Security"', lines: [
          'Rico, it\'s Vega Security. Credible threat on the VIP floor tonight.',
          'I need the service door unlocked at 21:00 for a quiet sweep.',
          'Do NOT call upstairs — we think the threat is listening to the office line.',
          'Kill the north-door cameras for ten minutes so we don\'t spook him.',
          'Thanks, big man. Same as always.',
          'Guest doors still open at 22:00 as planned.',
        ] },
        sender: { kind: 'SENDER', title: 'Sender details', lines: ['Display name: "Vega Security"', 'Number: +1 786 555 0199 — not the security office\'s saved number', 'First message ever from this number'] },
        request: { kind: 'REQUEST', title: 'What is being asked', lines: ['Unlock the service door at 21:00', 'Disable the north-door cameras for 10 minutes', 'Do not contact the security office'] },
        procedure: { kind: 'POLICY', title: 'Door procedure card', lines: ['Door or camera changes are confirmed by RADIO from the security office', 'Never act on a text or call alone', 'Security office radio: channel 2'] },
      },
      inspect: {
        type: 'mark',
        prompt: 'This story was written to get past a process. Mark every line of the thread that asks RICO to skip or switch off a security control.',
        source: 'thread',
        answer: [1, 2, 3],
        hint: 'Urgency and friendliness set the mood — look for the lines that would change a door, a camera or a check.',
      },
      decide: {
        prompt: 'It\'s 20:55. What does RICO do?',
        options: [
          { id: 'a', text: 'Open the door — if the threat is real, waiting could hurt people.', ok: false, outcome: 'Urgency is the lever. A real security chief can confirm in thirty seconds by radio.' },
          { id: 'b', text: 'Text back asking for a code word to prove it.', ok: false, outcome: 'That verifies through the channel the sender controls. Anyone holding that phone can answer a text.' },
          { id: 'c', text: 'Leave the door and cameras as they are, and confirm with the security office on the desk radio — the channel the procedure names.', ok: true, outcome: 'The security office knows nothing about a threat or a sweep. They log the number and send a guard to the service door.' },
          { id: 'd', text: 'Open the door but keep the cameras on.', ok: false, outcome: 'Half-complying still opens a restricted door on an unverified order.' },
        ],
      },
      learn: {
        happened: 'An invented emergency gave a reason to open a restricted door, switch off cameras and — crucially — not to verify.',
        evidence: 'A sender number that is not the security office, instructions that disable controls, an explicit "don\'t call upstairs", and a procedure that says changes come by radio.',
        risk: 'Unauthorised entry to the VIP floor with no camera record.',
        control: 'Verify authority through an independent, trusted channel (the radio or number you already have). Never disable a control on a message alone.',
        ai: 'The writing copied the chief\'s style from public posts. Style can be cloned; the channel cannot.',
        verify: 'Confirm an exception with the person who owns the control, through a channel you already trust. A familiar writing style is not an identity check.',
      },
      intel: '"Vega Security" pretext texts from +1 786 555 0199 — the same number as the cloned CFO voice note.',
    },
    {
      id: 'diana', file: '04', npc: 'DIANA', role: 'RECEPTIONIST', location: 'OCEAN PEARL HOTEL',
      technique: 'QUID PRO QUO', palette: ['#468C79', '#F0D8C4'],
      objective: 'Look at the IT help DIANA was just offered.',
      observe: {
        text: 'DIANA stares at a frozen booking screen. A chat window has popped up: "Hotel IT Assist — we can see your outage. We\'ll have you back online in 5 minutes."',
        signal: 'The "support agent" answers instantly and adapts to everything she types: a chatbot.',
        evidence: 'chat',
      },
      talk: [
        { ask: 'When did the outage start?', reply: '"Three hours ago. I asked on the staff social page if anyone else was down… ten minutes later, this chat appeared."', evidence: 'timeline' },
        { ask: 'What is IT Assist asking for?', reply: '"My admin login, and to install RemoteFix so they can take over the screen. Then they restore all the bookings — and add a free uptime monitor."', evidence: 'ask' },
        { ask: 'How do you normally get IT help?', reply: '"A ticket on the helpdesk portal, or extension 400. Real tickets start with HD-. They\'re just slow today."', evidence: 'helpdesk' },
      ],
      evidence: {
        chat: { kind: 'CHAT', title: '"Hotel IT Assist"', lines: ['We see the outage on your terminal. Ticket #A-7781 opened for you.', 'To restore bookings we need your admin login and a quick install of RemoteFix.', 'In return we restore everything AND add a free uptime monitor.', 'Keep this chat open — IT is overloaded, no need to call them.'] },
        timeline: { kind: 'TIMELINE', title: 'Today', lines: ['09:02 booking system goes down', '11:48 Diana posts about it on the public staff social page', '11:58 "IT Assist" opens a chat — not through the helpdesk'] },
        ask: { kind: 'REQUEST', title: 'What IT Assist wants', lines: ['Admin username and password', 'Install RemoteFix from remotefix-support.example', 'Full remote control of the front-desk terminal'] },
        helpdesk: { kind: 'POLICY', title: 'Hotel IT card', lines: ['Help comes from tickets HD-##### on the helpdesk portal, or ext. 400', 'IT never asks for your password', 'Remote sessions are started by IT from the portal'] },
      },
      inspect: {
        type: 'exchange',
        prompt: 'This is a trade. Put each item on the right side of it: what IT Assist OFFERS and what it ASKS FOR.',
        labels: ['OFFERED', 'ASKED FOR'],
        items: [
          { id: 'fix', text: 'Bookings restored in 5 minutes', answer: 'OFFERED' },
          { id: 'password', text: 'Diana\'s admin password', answer: 'ASKED FOR' },
          { id: 'monitor', text: 'A free uptime monitor', answer: 'OFFERED' },
          { id: 'remote', text: 'Remote control of the terminal', answer: 'ASKED FOR' },
          { id: 'nocall', text: 'Not calling the real IT team', answer: 'ASKED FOR' },
        ],
        hint: 'Read the chat again: everything that helps Diana is on one side; everything that hands over access or cuts out the real IT team is on the other.',
      },
      decide: {
        prompt: 'The chat is waiting for her password. What does DIANA do?',
        options: [
          { id: 'a', text: 'Give the login, then change the password right after the fix.', ok: false, outcome: 'Remote control with admin rights is enough to plant persistent access long before she changes anything.' },
          { id: 'b', text: 'Ask IT Assist for a ticket number first.', ok: false, outcome: 'It already gave one — #A-7781 — but real tickets start HD- and come from the portal. The requester\'s own data cannot verify the requester.' },
          { id: 'c', text: 'Close the chat, open a ticket on the helpdesk portal and call extension 400. Share no credentials and install no tools from an unsolicited chat.', ok: true, outcome: 'Real IT confirms there is no "IT Assist". They restore bookings themselves and block remotefix-support.example.' },
          { id: 'd', text: 'Let it install RemoteFix but watch what it does.', ok: false, outcome: 'Watching does not stop a remote-control tool from copying guest data or installing more software.' },
        ],
      },
      learn: {
        happened: 'Help was offered in exchange for access: the "support" arrived minutes after a public post about the outage and asked for an admin login and remote control.',
        evidence: 'A chat that started outside the helpdesk, a ticket format that is not the hotel\'s, a password request IT never makes, and "no need to call them".',
        risk: 'Full control of the front-desk terminal: guest records and payment systems.',
        control: 'Get help only through official, known support channels. IT never asks for passwords; no remote tools from unsolicited contacts.',
        ai: 'A chatbot made the "agent" instant and attentive. Responsiveness is not legitimacy.',
        verify: 'Contact IT through the published helpdesk. Real support never asks for your password or MFA code, however fast or helpful it seems.',
      },
      intel: 'Fake "Hotel IT Assist" chatbot trades a quick fix for admin logins; it found the outage through a public staff post.',
    },
    {
      id: 'carlos', file: '05', npc: 'CARLOS', role: 'STREET VENDOR', location: 'LITTLE HAVANA MARKET',
      technique: 'ELICITATION', palette: ['#F27D78', '#F3BC75'],
      objective: 'Find out what CARLOS has been telling a friendly stranger.',
      observe: {
        text: 'CARLOS slides a cafecito across the counter. "You\'re the second curious one this week! A food blogger, very nice — chats with me every day for my review."',
        signal: 'The blogger\'s account posted 40 near-identical five-star reviews across the city in two days.',
        evidence: 'log',
      },
      talk: [
        { ask: 'What did the blogger ask about?', reply: '"Oh, everything! The croquetas, my hours, the guards who buy coffee… Here, I still have our chat."', evidence: 'answers' },
        { ask: 'Did they post the review?', reply: '"Not yet. But look at their page — so many reviews! A professional."', evidence: 'persona' },
        { ask: 'Who buys coffee from you late?', reply: '"The convention security crew. Every night at two, the whole shift comes over. I told the blogger — they wanted to photograph the rush."', evidence: 'picture' },
      ],
      evidence: {
        log: { kind: 'CHAT LOG', title: 'Four days of questions', lines: [
          'What\'s your secret for the croquetas?',
          'What time do you open and close?',
          'Do the convention guards ever stop by? They must love your coffee!',
          'What time do they usually come? I\'d love to photograph the rush.',
          'Is that side door by the loading dock always that quiet?',
          'Which van brings the catering in the morning?',
          'Can I mention your name in the review?',
        ] },
        answers: { kind: 'ANSWERS', title: 'What Carlos told them', lines: ['Guards take their coffee break together at 02:00, for about 20 minutes', 'The loading-dock side door is unwatched during the break', 'Catering van arrives at 05:00'] },
        persona: { kind: 'PROFILE', title: '"Miami Bites" blogger', lines: ['Account two days old', '40 five-star reviews with near-identical wording', 'No photos of any food'] },
        picture: { kind: 'ANALYSIS', title: 'Put together', lines: ['02:00–02:20 guards away · side door unwatched · 05:00 delivery', 'Each answer was harmless alone; together they are a plan to enter the convention unseen', 'All of it went to an account that is two days old'] },
      },
      inspect: {
        type: 'probe',
        prompt: 'Friendly chat can hide real questions. Select the questions that collected sensitive information.',
        source: 'log',
        answer: [2, 3, 4, 5],
        hint: 'Opening hours are on Carlos\'s sign. Look for questions about people\'s routines, unwatched doors and deliveries.',
      },
      decide: {
        prompt: 'CARLOS realises what the chat adds up to. What now?',
        options: [
          { id: 'a', text: 'Stop chatting with customers about anything.', ok: false, outcome: 'Friendliness is Carlos\'s business. The fix is knowing what is sensitive, not silence.' },
          { id: 'b', text: 'Confront the blogger next time and demand who they work for.', ok: false, outcome: 'That tips them off and still leaves the shared schedule exposed. Report it instead.' },
          { id: 'c', text: 'Post the blogger\'s profile online to warn everyone.', ok: false, outcome: 'Public call-outs can target the wrong person and do nothing about the exposed routine.' },
          { id: 'd', text: 'Tell the convention security office exactly what was shared, and keep schedules, routines and access points out of small talk.', ok: true, outcome: 'Security staggers tonight\'s break and posts a guard at the side door.' },
        ],
      },
      learn: {
        happened: 'Friendly, harmless-sounding questions over four days pieced together the convention guards\' break, an unwatched door and the catering delivery time.',
        evidence: 'Questions drifting from food to guard routines, a side door and deliveries — from a two-day-old account full of mass-produced reviews.',
        risk: 'A timeline for entering the convention unseen.',
        control: 'Recognise what is sensitive (schedules, routines, access points). Share only public information and report patterns of probing to security.',
        ai: 'A generated "blogger" persona with mass-produced reviews built trust. The persona was synthetic; the questions were the attack.',
        verify: 'Notice what a friendly conversation is collecting. Before sharing schedules, systems or names, ask why a stranger needs them; verify a persona before trusting its reviews.',
      },
      intel: 'Elicitation mapped the convention: guards\' break 02:00–02:20, unwatched loading-dock door, catering van at 05:00.',
    },
  ];

  // ── CIPHER: THE TRUST NETWORK ───────────────────────────
  const CIPHER = {
    intro: '"Five little fires, GHOST. Did you see the city — or the network?" A projection fills the plaza: tonight\'s operation against the convention keynote.',
    steps: [
      {
        id: 'correlate', type: 'match', title: 'CORRELATE',
        prompt: 'Each part of tonight\'s operation reuses a play you already investigated. Link every artifact to its case file.',
        items: [
          { id: 'a1', text: 'A "speaker lounge" invite: free hardware wallets for anyone who signs in with their convention account.', answer: 'coco' },
          { id: 'a2', text: 'A voice note in the convention director\'s voice telling the AV crew to let "the keynote\'s tech lead" backstage.', answer: 'marcus' },
          { id: 'a3', text: 'A text from "Venue Security": fire-code emergency, prop the loading dock open, don\'t radio the control room.', answer: 'rico' },
          { id: 'a4', text: 'A "stage-tech helpdesk" chatbot offering to fix the projector in exchange for the AV admin login.', answer: 'diana' },
          { id: 'a5', text: 'The timing: in through the side door at 02:00, while the guards take their coffee break.', answer: 'carlos' },
        ],
        cipher: '"Pattern recognition. Cute. But patterns can be coincidence."',
      },
      {
        id: 'links', type: 'multi', title: 'CONNECT',
        prompt: 'What ties the five incidents into one campaign? Select every connection the evidence supports.',
        options: [
          { id: 'number', text: 'The same number (+1 786 555 0199) sent the cloned CFO voice note and the "Vega Security" texts.', ok: true },
          { id: 'channel', text: 'Every play pushed its target away from the normal channel: don\'t call security, IT, or upstairs.', ok: true },
          { id: 'target', text: 'Every target was a way into the convention, its guests or its staff.', ok: true },
          { id: 'typos', text: 'All the messages had spelling mistakes.', ok: false, why: 'They were fluent — that was the point. Writing quality is no longer a reliable signal.' },
          { id: 'deepfake', text: 'Every case used a deepfake video.', ok: false, why: 'Only one case used a synthetic voice; the others used lures, chatbots, cloned writing style and a fake persona.' },
          { id: 'careless', text: 'The victims were careless people.', ok: false, why: 'They were helpful, busy and under pressure — exactly what social engineering exploits. Blame does not fix process.' },
        ],
        cipher: '"So you can count to one. One operator, five faces."',
      },
      {
        id: 'identities', type: 'labels', title: 'VERIFY',
        prompt: 'Which identities in tonight\'s operation are VERIFIED through a channel you trust, and which are only CLAIMED?',
        labels: ['VERIFIED', 'CLAIMED'],
        items: [
          { id: 'director', text: '"Convention director" — voice note to the AV crew', answer: 'CLAIMED' },
          { id: 'venue', text: '"Venue Security" — text from +1 786 555 0199', answer: 'CLAIMED' },
          { id: 'office', text: 'Convention security office — reached on the radio channel listed in the staff sheet', answer: 'VERIFIED' },
          { id: 'helpdesk', text: '"Stage-tech helpdesk" chatbot', answer: 'CLAIMED' },
          { id: 'vendor', text: 'VaultLine Audits — the entry in the vendor directory', answer: 'VERIFIED' },
        ],
        cipher: '"A voice. A name on a screen. A friendly chat. People trust what feels familiar."',
      },
      {
        id: 'controls', type: 'multi', title: 'DEFEND',
        prompt: 'Pick the controls that stop tonight\'s operation. Choose all that apply.',
        options: [
          { id: 'callback', text: 'Call back on a known channel before any access or approval request is acted on.', ok: true },
          { id: 'report', text: 'Brief staff and give them a one-tap way to report lures and odd requests.', ok: true },
          { id: 'twoperson', text: 'No door, camera or credential change on a message alone — two-person confirmation.', ok: true },
          { id: 'roster', text: 'Stagger the guards\' break and keep the side door staffed.', ok: true },
          { id: 'spelling', text: 'Block every message that contains a spelling error.', ok: false, why: 'The operation\'s messages were fluent; this filter would stop none of them.' },
          { id: 'phones', text: 'Ban phones inside the convention.', ok: false, why: 'Disruptive and beside the point: the attacks exploit trust and process, not the device.' },
        ],
        cipher: '"Procedures. How… inconvenient."',
      },
      {
        id: 'conclusion', type: 'single', title: 'CONCLUDE',
        prompt: 'Present your conclusion to the convention\'s security team.',
        options: [
          { id: 'one', text: 'Five unrelated scams that happened to hit the same week.', ok: false, why: 'The shared number, the shared target and the shared "skip the normal channel" move say otherwise.' },
          { id: 'polish', text: 'The messages were fake because they were too polished to be human.', ok: false, why: 'Polish proves nothing either way. What exposed them was unverified origin, not style.' },
          { id: 'network', text: 'One operator ran a coordinated, AI-assisted campaign: convincing messages from unverified origins across five channels, aimed at backstage access during the 02:00 gap. Verify through trusted channels and close the gap.', ok: true },
        ],
        cipher: '"…Convincing is not legitimate. You were listening after all."',
      },
    ],
  };

  const TECHNIQUES = CASES.map(c => c.technique);

  function byId(id) { return CASES.find(c => c.id === id) || null; }

  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

  // Checks an INSPECT answer. Feedback explains what to re-read without
  // naming the technique or giving away the answer.
  function checkInspect(c, answer) {
    const ins = c.inspect;
    if (ins.type === 'bait') {
      const lureOk = answer && answer.lure === ins.lure.answer;
      const costOk = answer && Array.isArray(answer.cost) && sameSet(answer.cost, ins.cost.answer);
      if (lureOk && costOk) return { ok: true, feedback: 'Lure and price separated.' };
      const parts = [];
      if (!lureOk) parts.push(ins.lure.hint);
      if (!costOk) parts.push(ins.cost.hint);
      return { ok: false, feedback: parts.join(' ') };
    }
    if (ins.type === 'fields' || ins.type === 'exchange') {
      const wrong = ins.items.filter(it => !answer || answer[it.id] !== it.answer);
      if (!wrong.length) return { ok: true, feedback: 'Every line sorted correctly.' };
      return { ok: false, wrong: wrong.map(w => w.id), feedback: wrong.length + ' of ' + ins.items.length + ' lines need another look. ' + ins.hint };
    }
    if (ins.type === 'mark' || ins.type === 'probe') {
      const sel = Array.isArray(answer) ? answer.slice().sort() : [];
      if (sameSet(sel, ins.answer)) return { ok: true, feedback: 'You found every one.' };
      const missed = ins.answer.filter(i => !sel.includes(i)).length;
      const extra = sel.filter(i => !ins.answer.includes(i)).length;
      const parts = [];
      if (missed) parts.push(missed + (missed === 1 ? ' line is' : ' lines are') + ' still unmarked.');
      if (extra) parts.push(extra + (extra === 1 ? ' marked line is' : ' marked lines are') + ' harmless on its own.');
      return { ok: false, feedback: parts.join(' ') + ' ' + ins.hint };
    }
    return { ok: false, feedback: 'Unknown analysis.' };
  }

  function checkDecision(c, optionId) {
    const o = c.decide.options.find(x => x.id === optionId);
    if (!o) return { ok: false, outcome: 'Pick one of the options.' };
    return { ok: !!o.ok, outcome: o.outcome };
  }

  function checkCipherStep(step, answer) {
    if (step.type === 'match' || step.type === 'labels') {
      const wrong = step.items.filter(it => !answer || answer[it.id] !== it.answer);
      if (!wrong.length) return { ok: true };
      return { ok: false, wrong: wrong.map(w => w.id),
        feedback: wrong.length + (wrong.length === 1 ? ' item doesn\'t' : ' items don\'t') + ' match the evidence yet. Open CASE FILES [TAB] and compare.' };
    }
    if (step.type === 'multi') {
      const sel = Array.isArray(answer) ? answer : [];
      const good = step.options.filter(o => o.ok).map(o => o.id);
      if (sameSet(sel, good)) return { ok: true };
      const bad = step.options.filter(o => !o.ok && sel.includes(o.id));
      const missing = good.filter(g => !sel.includes(g)).length;
      const parts = bad.map(b => b.why);
      if (missing) parts.push(missing + (missing === 1 ? ' supported answer is' : ' supported answers are') + ' still unselected.');
      return { ok: false, feedback: parts.join(' ') };
    }
    if (step.type === 'single') {
      const o = step.options.find(x => x.id === answer);
      if (o && o.ok) return { ok: true };
      return { ok: false, feedback: o ? o.why : 'Pick a conclusion.' };
    }
    return { ok: false, feedback: 'Unknown step.' };
  }

  return { CASES, CIPHER, TECHNIQUES, byId, checkInspect, checkDecision, checkCipherStep };
});
