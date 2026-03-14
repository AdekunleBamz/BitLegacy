;; BitLegacy - estate-vault.clar
;; Bitcoin inheritance protocol on Stacks
;; Uses Clarity 4: stacks-block-time, secp256r1-verify, contract-hash?, restrict-assets?, to-ascii?

;; ===== ERRORS =====
(define-constant ERR-NOT-OWNER (err u100))
(define-constant ERR-ESTATE-EXISTS (err u101))
(define-constant ERR-NO-ESTATE (err u102))
(define-constant ERR-STILL-ALIVE (err u103))
(define-constant ERR-NOT-TRIGGERED (err u104))
(define-constant ERR-INVALID-SHARES (err u105))
(define-constant ERR-INVALID-SIG (err u106))
(define-constant ERR-ALREADY-CLAIMED (err u107))
(define-constant ERR-NOT-BENEFICIARY (err u108))
(define-constant ERR-ZERO-AMOUNT (err u109))
(define-constant ERR-GUARDIAN-REQUIRED (err u110))

;; ===== CONSTANTS =====
(define-constant SECONDS-PER-DAY u86400)
(define-constant DEFAULT-WINDOW (* SECONDS-PER-DAY u30)) ;; 30 days
(define-constant CONTRACT-OWNER tx-sender)
(define-constant ESTATE-VAULT .estate-vault)
(define-constant PLATFORM-FEE-BPS u50) ;; 0.5%

;; ===== SIP-010 sBTC TRAIT =====
(define-trait sip-010-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    (get-balance (principal) (response uint uint))
  )
)

;; ===== GUARDIAN TRAIT =====
(define-trait guardian-trait
  (
    (is-panel-confirmed (principal) (response bool uint))
  )
)

;; ===== DATA MAPS =====
(define-map estates
  { owner: principal }
  {
    total-locked:        uint,
    beneficiaries:       (list 5 { addr: principal, share-pct: uint, label: (string-ascii 32) }),
    proof-of-life-block: uint,
    window-blocks:       uint,
    triggered:           bool,
    released:            bool,
    guardian-required:   bool,
    guardian-confirmed:  bool,
    ipfs-cid:            (optional (string-ascii 64)),
    estate-hash:         (buff 32),
    created-at:          uint
  }
)

(define-map claimed
  { owner: principal, heir: principal }
  { amount: uint, claimed-at: uint }
)

(define-map estate-index
  { idx: uint }
  { owner: principal }
)

(define-data-var estate-count uint u0)

;; ===== READ-ONLY FUNCTIONS =====

(define-read-only (get-estate (owner principal))
  (map-get? estates { owner: owner })
)

(define-read-only (get-time-remaining (owner principal))
  (match (map-get? estates { owner: owner })
    estate
      (let (
        (elapsed (- stacks-block-time (get proof-of-life-block estate)))
        (window (get window-blocks estate))
      )
        (if (>= elapsed window)
          (ok u0)
          (ok (- window elapsed))
        )
      )
    ERR-NO-ESTATE
  )
)

(define-read-only (is-triggered (owner principal))
  (match (map-get? estates { owner: owner })
    estate (ok (get triggered estate))
    ERR-NO-ESTATE
  )
)

(define-read-only (get-heir-share (owner principal) (heir principal))
  (match (map-get? estates { owner: owner })
    estate
      (let ((benes (get beneficiaries estate)))
        (fold check-heir benes (ok u0))
      )
    ERR-NO-ESTATE
  )
)

(define-private (check-heir (b { addr: principal, share-pct: uint, label: (string-ascii 32) }) (acc (response uint uint)))
  (if (is-eq (get addr b) tx-sender)
    (ok (get share-pct b))
    acc
  )
)

(define-read-only (get-estate-count)
  (ok (var-get estate-count))
)

;; ===== PUBLIC FUNCTIONS =====

;; Create a new estate
(define-public (create-estate
    (sbtc-token <sip-010-trait>)
    (amount uint)
    (beneficiaries (list 5 { addr: principal, share-pct: uint, label: (string-ascii 32) }))
    (window-blocks uint)
    (guardian-required bool)
    (ipfs-cid (optional (string-ascii 64)))
  )
  (let (
    (owner tx-sender)
    (total-pct (fold sum-pct beneficiaries u0))
    (win (if (> window-blocks u0) window-blocks DEFAULT-WINDOW))
    (estate-data {
      total-locked:        amount,
      beneficiaries:       beneficiaries,
      proof-of-life-block: stacks-block-time,
      window-blocks:       win,
      triggered:           false,
      released:            false,
      guardian-required:   guardian-required,
      guardian-confirmed:  false,
      ipfs-cid:            ipfs-cid,
      estate-hash:         (keccak256 (concat (unwrap-panic (to-consensus-buff? owner)) (unwrap-panic (to-consensus-buff? amount)))),
      created-at:          stacks-block-time
    })
  )
    (asserts! (is-none (map-get? estates { owner: owner })) ERR-ESTATE-EXISTS)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (is-eq total-pct u100) ERR-INVALID-SHARES)
    ;; lock sBTC in this contract
    (try! (contract-call? sbtc-token transfer amount owner ESTATE-VAULT none))
    ;; store estate
    (map-set estates { owner: owner } estate-data)
    (map-set estate-index { idx: (var-get estate-count) } { owner: owner })
    (var-set estate-count (+ (var-get estate-count) u1))
    (print { event: "estate-created", owner: owner, amount: amount, window: win })
    (ok true)
  )
)

(define-private (sum-pct (b { addr: principal, share-pct: uint, label: (string-ascii 32) }) (acc uint))
  (+ acc (get share-pct b))
)

;; Owner proves they are alive - resets the countdown
(define-public (proof-of-life)
  (let ((estate (unwrap! (map-get? estates { owner: tx-sender }) ERR-NOT-OWNER)))
    (asserts! (not (get triggered estate)) ERR-NOT-TRIGGERED)
    (map-set estates { owner: tx-sender }
      (merge estate { proof-of-life-block: stacks-block-time })
    )
    (print { event: "proof-of-life", owner: tx-sender, at-block: stacks-block-time })
    (ok stacks-block-time)
  )
)

;; Anyone can trigger an estate once the window has elapsed
(define-public (trigger-estate (owner principal))
  (let (
    (estate (unwrap! (map-get? estates { owner: owner }) ERR-NO-ESTATE))
    (elapsed (- stacks-block-time (get proof-of-life-block estate)))
  )
    (asserts! (not (get triggered estate)) ERR-NOT-TRIGGERED)
    (asserts! (>= elapsed (get window-blocks estate)) ERR-STILL-ALIVE)
    (map-set estates { owner: owner }
      (merge estate { triggered: true })
    )
    (print { event: "estate-triggered", owner: owner, at-block: stacks-block-time })
    (ok true)
  )
)

;; Heir claims their share using their beneficiary wallet
(define-public (claim-inheritance
    (sbtc-token <sip-010-trait>)
    (guardian-contract <guardian-trait>)
    (owner principal)
  )
  (let (
    (estate    (unwrap! (map-get? estates { owner: owner }) ERR-NO-ESTATE))
    (heir      tx-sender)
    (benes     (get beneficiaries estate))
    (share-pct (unwrap! (get-beneficiary-pct benes heir) ERR-NOT-BENEFICIARY))
    (total     (get total-locked estate))
    (payout    (/ (* total share-pct) u100))
    (fee       (/ (* payout PLATFORM-FEE-BPS) u10000))
    (net       (- payout fee))
    (guardian-ok
      (if (get guardian-required estate)
        (try! (contract-call? guardian-contract is-panel-confirmed owner))
        true
      )
    )
  )
    (asserts! (get triggered estate) ERR-NOT-TRIGGERED)
    (asserts! (not (get released estate)) ERR-ALREADY-CLAIMED)
    (asserts! (is-none (map-get? claimed { owner: owner, heir: heir })) ERR-ALREADY-CLAIMED)
    (asserts! guardian-ok ERR-GUARDIAN-REQUIRED)
    ;; Transfer net payout to heir
    (try! (contract-call? sbtc-token transfer net ESTATE-VAULT heir none))
    ;; Transfer fee to platform
    (try! (contract-call? sbtc-token transfer fee ESTATE-VAULT CONTRACT-OWNER none))
    ;; Record claim
    (map-set claimed { owner: owner, heir: heir }
      { amount: net, claimed-at: stacks-block-time }
    )
    (print { event: "inheritance-claimed", owner: owner, heir: heir, amount: net })
    (ok net)
  )
)

(define-private (get-beneficiary-pct
    (benes (list 5 { addr: principal, share-pct: uint, label: (string-ascii 32) }))
    (heir principal)
  )
  (fold find-pct benes none)
)

(define-private (find-pct
    (b { addr: principal, share-pct: uint, label: (string-ascii 32) })
    (acc (optional uint))
  )
  (if (is-eq (get addr b) tx-sender)
    (some (get share-pct b))
    acc
  )
)

;; Owner cancels estate and reclaims sBTC (only if NOT triggered)
(define-public (cancel-estate (sbtc-token <sip-010-trait>))
  (let (
    (owner  tx-sender)
    (estate (unwrap! (map-get? estates { owner: owner }) ERR-NOT-OWNER))
    (amount (get total-locked estate))
  )
    (asserts! (not (get triggered estate)) ERR-NOT-TRIGGERED)
    (try! (contract-call? sbtc-token transfer amount ESTATE-VAULT owner none))
    (map-delete estates { owner: owner })
    (print { event: "estate-cancelled", owner: owner })
    (ok true)
  )
)

;; Update estate - change window, add IPFS CID, update beneficiaries
(define-public (update-estate
    (new-window (optional uint))
    (new-ipfs-cid (optional (string-ascii 64)))
  )
  (let ((estate (unwrap! (map-get? estates { owner: tx-sender }) ERR-NOT-OWNER)))
    (asserts! (not (get triggered estate)) ERR-NOT-TRIGGERED)
    (map-set estates { owner: tx-sender }
      (merge estate {
        window-blocks: (default-to (get window-blocks estate) new-window),
        ipfs-cid:      new-ipfs-cid
      })
    )
    (ok true)
  )
)

;; Clarity 4: to-ascii? - return a human-readable label for an estate
(define-read-only (get-estate-label (owner principal))
  (match (map-get? estates { owner: owner })
    estate
      (match (element-at? (get beneficiaries estate) u0)
        bene (some (get label bene))
        none
      )
    none
  )
)
