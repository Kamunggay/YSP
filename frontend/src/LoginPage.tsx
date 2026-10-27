              </span>
            )}
            {verifiedSessionData?.tierSummary && (
              <span className="kamunggay-verified-banner-slot-tier">
                {verifiedSessionData.tierSummary}
              </span>
            )}
          </div>
          <div className="kamunggay-details-box-wrap">
            <img
              src="/assets/kamunggay/details-box.png"
              alt="Active Chapter, Granted Duties, and Governance Constraints"
              className="kamunggay-details-box-img"
              draggable={false}
            />
            {verifiedSessionData?.activeChapter && (
              <span className="kamunggay-details-slot slot-chapter">
                {verifiedSessionData.activeChapter}
              </span>
            )}
            {verifiedSessionData?.grantedDuties && (
              <span className="kamunggay-details-slot slot-duties">
                {verifiedSessionData.grantedDuties}
              </span>
            )}
            {verifiedSessionData?.governanceConstraints && (
              <span className="kamunggay-details-slot slot-constraints">
                {verifiedSessionData.governanceConstraints}
              </span>
            )}
          </div>
          <div className="kamunggay-auth-btn-stack">
            <PhotoButton
              type="button"
              unclickedSrc="/assets/kamunggay/dashboard-button.png"
              clickedSrc="/assets/kamunggay/dashboard-button-when-clicked.png"
              alt="Enter Dashboard"
              onClick={() => setScreen('login')}
            />
          </div>
          <div className="kamunggay-auth-clubs-footer" style={{ marginTop: 'clamp(22px, 3.8vh, 42px)' }}>
            <img
              src="/assets/kamunggay/3-of-clubs.png"
              alt="3 of Clubs"
              className="kamunggay-auth-clubs-logo"
              draggable={false}
            />
          </div>
        </section>
      )}
    </div>
  );
}
