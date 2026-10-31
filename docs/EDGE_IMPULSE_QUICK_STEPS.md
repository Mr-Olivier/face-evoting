# Edge Impulse + FaceVote: Simple Steps

How to connect Edge Impulse, collect data from the app, train the model, and use it to recognise voters.

> **What the model does:** your Edge Impulse model **finds the face** in the camera.
> The app then checks **who** the person is by comparing that face with the one saved at registration.
> Together, they recognise the voter.

---

## Your setup

| | |
| --- | --- |
| Edge Impulse project | **FaceVote Detector** (id 1153061) ✅ connected |
| Open in Edge Impulse | https://studio.edgeimpulse.com/studio/1153061 |
| Voter site | http://localhost:3000 |
| **Admin login page** | **http://localhost:3000/your-secret-path** |
| Admin password | the value of `ADMIN_PASSWORD` in your `.env` file |

> 🔒 The admin page is **secret**: it isn't linked anywhere on the voter site, and `http://localhost:3000/admin` shows "Page not found" until you sign in.
> The password stays only in `.env`, which is never uploaded to GitHub. Don't write it in this file.
> To change it, edit `ADMIN_PASSWORD` (and `ADMIN_LOGIN_PATH` for the address) in `.env`, then restart the app.

**Check the Edge Impulse connection at any time:**

```bash
npm run ei:check
```

It should print `Connected to Edge Impulse project "FaceVote Detector"`.

---

## ▶ Your next steps (the API key is already done)

- [x] Steps 1–5: project created, API key added to `.env`
- [ ] **Restart the app** so it reads the new key: **Ctrl+C**, then `npm run dev`
- [ ] Open **http://localhost:3000/your-secret-path** and sign in with your `ADMIN_PASSWORD`
- [ ] Open **Integrations** and confirm Edge Impulse shows **Connected**
- [ ] Continue with **Part 2** below (collect data)

---

## Set up email with Gmail (for registration and vote confirmations)

The app emails voters when they are **registered** and after they **vote**. It never emails PINs.

**A. Turn on 2-Step Verification** (App Passwords need this)

- [ ] Go to https://myaccount.google.com and sign in with the Gmail account that will send the emails
- [ ] Click **Security**
- [ ] Under **"How you sign in to Google"**, click **2-Step Verification** → **Turn on** → follow the prompts

**B. Create the App Password**

- [ ] Go to https://myaccount.google.com/apppasswords (or search **"App passwords"** in your Google Account)
- [ ] App name: `FaceVote` → **Create**
- [ ] **Copy the 16-character password now.** Google shows it only once.

**C. Put it in `.env`**

```env
EMAIL_PROVIDER="gmail"
GMAIL_USER="yourname@gmail.com"
GMAIL_APP_PASSWORD="abcdefghijklmnop"   # the 16 characters, no spaces
EMAIL_SENDER_NAME="FaceVote Elections"
```

**D. Test it**

- [ ] Restart the app (**Ctrl+C**, then `npm run dev`)
- [ ] Admin console → **Integrations** → the Email card should say **Gmail · Configured**
- [ ] Type your email in **Send a test email to** → **Send** → check your inbox (and the **spam** folder)

| Problem | Fix |
| --- | --- |
| "Gmail rejected the login" | Use the **App Password**, not your normal Gmail password |
| "Gmail requires an App Password" | Turn on 2-Step Verification first (step A) |
| No "App passwords" page | Use a personal `@gmail.com` account; school or work accounts may block it |
| Email went to spam | Open it and click **Not spam** before your demo |

> Gmail allows about **500 emails per day**, which is plenty for a demo.

---

## What voters receive by email

| When | Email |
| --- | --- |
| Registered by an officer | Full name, voter number, masked National ID, registered address, how to vote, link to the voting site |
| Clicks **Forgot your PIN?** | A **6-digit code** (valid 10 minutes, single use) |
| Sets a new PIN | "Your PIN was changed" security notice |
| Votes | Election, time and **participation reference**, never the choice |

> The PIN itself is **never** emailed. Voters choose it privately at registration, or with the reset code.

**Try the Forgot PIN flow:**

- [ ] Register a test voter with **your own email** (Admin → Voters)
- [ ] Open http://localhost:3000/verify → click **Forgot your PIN?**
- [ ] Enter the National ID → **Email me a code** → check your inbox
- [ ] Type the code → choose a new PIN → you get a "PIN changed" email
- [ ] Vote with the National ID + new PIN

---

## Part 1: Connect Edge Impulse to the app (5 minutes)

- [ ] **1.** Go to https://studio.edgeimpulse.com and log in (the free plan is fine).
- [ ] **2.** Click **Create new project** and name it **FaceVote Detector**.
- [ ] **3.** On the project **Dashboard** → **Project info**, set the labelling method to **Bounding boxes (object detection)**.
- [ ] **4.** Still on the Dashboard, open the **Keys** tab and **copy the API key** (it starts with `ei_`).
- [ ] **5.** Open the `.env` file in the project and paste the key:

  ```env
  EDGE_IMPULSE_API_KEY="ei_paste_your_key_here"
  ```

- [ ] **6.** Restart the app: press **Ctrl+C** in the terminal, then run:

  ```bash
  npm run dev
  ```

- [ ] **7.** Log in to the admin console → **Integrations**. Edge Impulse should show **Connected** with your project name. ✅

---

## Part 2: Collect data from the app (it goes straight into Edge Impulse)

- [ ] **8.** Find **3–10 volunteers**. Each one signs a consent form and gets a code: `VOL-01`, `VOL-02`, … (**never use names**).
- [ ] **9.** In the admin console, open **Data collection**.
- [ ] **10.** For **each volunteer**:
  - Type their code in **Subject code**
  - Tick **Consent form signed**
  - Press **Burst ×5** several times while they change position:
    - closer and farther from the camera
    - head turned a little left and right
    - glasses on and off
    - different light (window, lamp, darker room)
  - Aim for **30–50 photos per person**
- [ ] **11.** Point the camera **away from people** (a wall, a desk, an empty room) and press **Capture background** **30–50 times**.
- [ ] **12.** Check the counters on the page:

  | What | Target |
  | --- | --- |
  | Faces | 150–300 |
  | Background | 30–50 |

Every photo is sent **directly to Edge Impulse**, already labelled **`face`**.

---

## Part 3: Train the model in Edge Impulse

- [ ] **13.** Open **Data acquisition** and check that your images are there, split into **Training** and **Test**.
- [ ] **14.** Open **Labeling queue** and look at each photo quickly. **Fix or delete** any wrong boxes.
- [ ] **15.** Go to **Impulse design → Create impulse** and set:

  | Setting | Value |
  | --- | --- |
  | Image size | **96 × 96** |
  | Resize mode | **Squash** |
  | Processing block | **Image** |
  | Learning block | **Object Detection** |

  Then click **Save Impulse**.

- [ ] **16.** Click **Image** (left menu) → colour depth **Grayscale** → **Save parameters** → **Generate features**.
- [ ] **17.** Click **Object detection** (left menu):

  | Setting | Value |
  | --- | --- |
  | Model | **FOMO (MobileNet V2 0.35)** |
  | Training cycles | **60** |

  Then click **Start training**.

- [ ] **18.** When training finishes, **take screenshots for your report**:
  - the **F1 score** (aim for **0.85 or higher**)
  - the **confusion matrix**

  If the F1 is lower than 0.85, collect more photos (Part 2) and train again.

- [ ] **19.** Open **Model testing** → **Classify all** and write down the **accuracy**.

---

## Part 4: Put the trained model into the app

- [ ] **20.** In Edge Impulse open **Deployment** → search **WebAssembly** → click **Build** → download the `.zip`.
- [ ] **21.** Unzip it and copy **these 2 files**:

  ```
  edge-impulse-standalone.js
  edge-impulse-standalone.wasm
  ```

  into this folder of the project:

  ```
  public/models/edge-impulse/
  ```

- [ ] **22.** Open `public/models/edge-impulse/model-card.json`:
  - replace the sample numbers with **your** results (F1, precision, recall, accuracy, number of images…)
  - change `"isSample": true` to `"isSample": false`
- [ ] **23.** Restart the app (**Ctrl+C**, then `npm run dev`).
- [ ] **24.** In the admin console open **AI model**. It should say **"Trained Edge Impulse model active"**. ✅

---

## Part 5: Use it to recognise voters

- [ ] **25.** In **Admin → Voters**, register each voter: ID details, PIN and **3 face samples**.
- [ ] **26.** The voter goes to **Vote now**:
  1. enters their **National ID + PIN**
  2. checks their details and clicks **Yes, this is me**
  3. looks at the camera and **blinks once**
     - your **Edge Impulse model** finds the face
     - the app compares it with the face saved at registration
  4. if it matches → they can vote ✅
     if not → *"Your face doesn't match"* ❌

---

## Quick troubleshooting

| Problem | Fix |
| --- | --- |
| Integrations says **"Not connected"** | Check the API key in `.env`, then restart the app |
| Upload fails on Data collection | Check your internet; copy a fresh API key from the **Keys** tab |
| AI model page still says **"Demo model"** | Both files must be in `public/models/edge-impulse/` with exactly these names; restart the app |
| The model misses faces | Collect more photos in different lighting and train again |
| The camera doesn't start | Allow camera access in the browser, and close other apps using the webcam |

---

📘 The longer guide is in [`MODEL_TRAINING.md`](MODEL_TRAINING.md).
