;; BitLegacy - sbtc-yield.clar
;; sBTC yield vault — estate owners can deposit sBTC to earn simulated yield
;; Demonstrates sBTC composability for the sBTC bounty

;; ===== ERRORS =====
(define-constant ERR-ZERO-AMOUNT (err u300))
(define-constant ERR-NO-DEPOSIT (err u301))
(define-constant ERR-NOT-OWNER (err u302))
(define-constant ERR-INSUFFICIENT-BALANCE (err u303))

;; ===== CONSTANTS =====
;; Simulated annual yield: 3.5% APY (expressed in basis points)
(define-constant YIELD-BPS u350)
(define-constant BPS-DENOMINATOR u10000)
(define-constant SECONDS-PER-YEAR u31536000)
(define-constant YIELD-VAULT .sbtc-yield)

;; ===== SIP-010 TRAIT =====
(define-trait sip-010-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    (get-balance (principal) (response uint uint))
  )
)

;; ===== DATA MAPS =====
(define-map deposits
  { owner: principal }
  {
    amount:       uint,
    deposited-at: uint,
    last-harvest: uint
  }
)

(define-data-var total-deposits uint u0)

;; ===== READ-ONLY FUNCTIONS =====

(define-read-only (get-deposit (owner principal))
  (map-get? deposits { owner: owner })
)

(define-read-only (get-yield-balance (owner principal))
  (match (map-get? deposits { owner: owner })
    deposit (ok (get amount deposit))
    ERR-NO-DEPOSIT
  )
)

(define-read-only (get-accrued-yield (owner principal))
  (match (map-get? deposits { owner: owner })
    deposit
      (let (
        (elapsed (- stacks-block-time (get last-harvest deposit)))
        (principal-amount (get amount deposit))
        ;; yield = principal * YIELD-BPS * elapsed / (BPS-DENOMINATOR * SECONDS-PER-YEAR)
        (yield-amount (/ (* (* principal-amount YIELD-BPS) elapsed) (* BPS-DENOMINATOR SECONDS-PER-YEAR)))
      )
        (ok yield-amount)
      )
    ERR-NO-DEPOSIT
  )
)

(define-read-only (get-total-deposits)
  (ok (var-get total-deposits))
)

;; ===== PUBLIC FUNCTIONS =====

;; Deposit sBTC into the yield vault
(define-public (deposit-to-yield (sbtc-token <sip-010-trait>) (amount uint))
  (let (
    (owner tx-sender)
    (existing (map-get? deposits { owner: owner }))
    (current-amount (default-to u0 (match existing dep (some (get amount dep)) none)))
    (now stacks-block-time)
  )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    ;; Transfer sBTC from owner to this contract
    (try! (contract-call? sbtc-token transfer amount owner YIELD-VAULT none))
    ;; Update or create deposit record
    (map-set deposits { owner: owner }
      {
        amount:       (+ current-amount amount),
        deposited-at: (default-to now (match existing dep (some (get deposited-at dep)) none)),
        last-harvest: now
      }
    )
    (var-set total-deposits (+ (var-get total-deposits) amount))
    (print { event: "yield-deposit", owner: owner, amount: amount, total: (+ current-amount amount) })
    (ok true)
  )
)

;; Withdraw principal + accrued yield
(define-public (withdraw-from-yield (sbtc-token <sip-010-trait>))
  (let (
    (owner tx-sender)
    (deposit (unwrap! (map-get? deposits { owner: owner }) ERR-NO-DEPOSIT))
    (principal-amount (get amount deposit))
    (elapsed (- stacks-block-time (get last-harvest deposit)))
    (yield-amount (/ (* (* principal-amount YIELD-BPS) elapsed) (* BPS-DENOMINATOR SECONDS-PER-YEAR)))
    (total-payout (+ principal-amount yield-amount))
  )
    ;; Transfer total payout back to owner
    (try! (contract-call? sbtc-token transfer total-payout YIELD-VAULT owner none))
    ;; Clean up deposit record
    (map-delete deposits { owner: owner })
    (var-set total-deposits (- (var-get total-deposits) principal-amount))
    (print { event: "yield-withdrawal", owner: owner, principal: principal-amount, yield: yield-amount, total: total-payout })
    (ok total-payout)
  )
)

;; Harvest yield only (keep principal deposited)
(define-public (harvest-yield (sbtc-token <sip-010-trait>))
  (let (
    (owner tx-sender)
    (deposit (unwrap! (map-get? deposits { owner: owner }) ERR-NO-DEPOSIT))
    (principal-amount (get amount deposit))
    (elapsed (- stacks-block-time (get last-harvest deposit)))
    (yield-amount (/ (* (* principal-amount YIELD-BPS) elapsed) (* BPS-DENOMINATOR SECONDS-PER-YEAR)))
  )
    (asserts! (> yield-amount u0) ERR-ZERO-AMOUNT)
    ;; Transfer yield to owner
    (try! (contract-call? sbtc-token transfer yield-amount YIELD-VAULT owner none))
    ;; Reset harvest timer, keep principal
    (map-set deposits { owner: owner }
      (merge deposit { last-harvest: stacks-block-time })
    )
    (print { event: "yield-harvest", owner: owner, yield: yield-amount })
    (ok yield-amount)
  )
)
