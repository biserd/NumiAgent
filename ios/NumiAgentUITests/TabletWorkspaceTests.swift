import XCTest

final class TabletWorkspaceTests: XCTestCase {
    @MainActor
    func testDeviceOnlyQuarterHasComparableSales() {
        let app = XCUIApplication()
        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }
        app.launchArguments = ["--guest-test-" + UUID().uuidString, "--guest-sales-fixture"]
        app.launch()
        let quarter = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "gallery-piece-")).firstMatch
        XCTAssertTrue(quarter.waitForExistence(timeout: 15))
        let gallery = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        gallery.name = "Device collection gallery on iPad"
        gallery.lifetime = .keepAlways
        add(gallery)
        quarter.tap()
        XCTAssertFalse(app.buttons["guest-save-record"].exists)
        let inspector = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        inspector.name = "Cabinet iPad specimen inspection"
        inspector.lifetime = .keepAlways
        add(inspector)
        let sales = app.buttons["guest-comparable-sales"].firstMatch
        XCTAssertTrue(sales.waitForExistence(timeout: 10))
        XCTAssertTrue(sales.isHittable)
        sales.tap()
        XCTAssertTrue(app.buttons["Check Numista auction sales"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["guest-sales-year"].value as? String, "1991")
        XCTAssertEqual(app.textFields["guest-sales-denomination"].value as? String, "quarter dollar")
        XCTAssertTrue(app.buttons["Check Numista auction sales"].isEnabled)
        app.buttons["Done"].firstMatch.tap()
        XCTAssertTrue(sales.waitForExistence(timeout: 5))
        app.buttons["Zoom photo 1"].firstMatch.tap()
        let zoomOut = app.buttons["Zoom out"].firstMatch
        XCTAssertTrue(zoomOut.waitForExistence(timeout: 5))
        let surface = app.descendants(matching: .any)["photo-zoom-surface"].firstMatch
        XCTAssertTrue(surface.waitForExistence(timeout: 5))
        surface.pinch(withScale: 2, velocity: 1)
        let enlarged = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: zoomOut)
        XCTAssertEqual(XCTWaiter.wait(for: [enlarged], timeout: 4), .completed, "Pinching should enlarge the specimen")
        app.buttons["Fit photo"].firstMatch.tap()
        let fitted = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == false"), object: zoomOut)
        XCTAssertEqual(XCTWaiter.wait(for: [fitted], timeout: 4), .completed)
    }

    @MainActor
    func testPreviewSecondOpinionFromCollection() {
        let app = XCUIApplication()
        app.launchArguments = ["--preview-collection"]
        app.launch()
        let open = app.buttons["Ask for a second opinion"].firstMatch
        XCTAssertTrue(open.waitForExistence(timeout: 15))
        open.tap()
        let card = app.images["opinion-card-preview"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 15))
        XCTAssertTrue(card.label.contains("Octavian denarius"))
        XCTAssertTrue(card.label.contains("METAL Silver"))
        XCTAssertTrue(card.label.contains("CATALOG REF. The Met 08.170.89"))
        XCTAssertTrue(card.label.contains("DEMO MARKET ESTIMATE"))
        let attachment = XCTAttachment(screenshot: card.screenshot())
        attachment.name = "second-opinion-card"
        attachment.lifetime = .keepAlways
        add(attachment)
        XCTAssertTrue(app.buttons["Share card"].firstMatch.isHittable)
    }

    @MainActor
    func testRotationAndRecordSelection() async throws {
        continueAfterFailure = false
        let device = XCUIDevice.shared
        device.orientation = .portrait
        defer { device.orientation = .portrait }
        let app = XCUIApplication()
        app.launchArguments = ["--preview-collection"]
        app.launch()

        let window = app.windows.firstMatch
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertTrue(app.navigationBars["Octavian denarius"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(window.frame.height > window.frame.width)
        capture("collection-portrait")

        device.orientation = .landscapeLeft
        for _ in 0..<30 {
            if window.frame.width > window.frame.height { break }
            try await Task.sleep(for: .milliseconds(500))
        }
        XCTAssertTrue(window.frame.width > window.frame.height, "The iPad window should rotate to landscape.")
        XCTAssertTrue(app.navigationBars["Octavian denarius"].firstMatch.exists)
        let sidebar = app.descendants(matching: .any)["workspace-checklists"].firstMatch
        XCTAssertTrue(sidebar.isHittable)
        let nextSpecimen = app.descendants(matching: .any)["specimen-demo-2"].firstMatch
        XCTAssertTrue(nextSpecimen.isHittable)
        capture("collection-landscape")

        nextSpecimen.tap()
        XCTAssertTrue(app.navigationBars["Mark Antony legionary denarius"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(nextSpecimen.isHittable, "Selecting a specimen should keep the list visible.")

        sidebar.tap()
        let checklist = app.buttons["Late Republican denarii"].firstMatch
        XCTAssertTrue(checklist.waitForExistence(timeout: 10))
        checklist.tap()
        XCTAssertTrue(app.navigationBars["Late Republican denarii"].firstMatch.waitForExistence(timeout: 10))
        let missingSlot = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@", "Sextus Pompey")).firstMatch
        XCTAssertTrue(missingSlot.waitForExistence(timeout: 10))
        capture("checklists-landscape")
    }

    @MainActor
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

final class PhoneSignInAndReviewTests: XCTestCase {
    @MainActor
    func testPhotoDraftAcceptsAnotherViewBeforeIdentification() {
        let app = XCUIApplication()
        app.launchArguments = ["--preview-photo-review"]
        app.launch()
        let preview = app.buttons["Preview a photo draft"]
        XCTAssertTrue(preview.waitForExistence(timeout: 15))
        preview.tap()
        let count = app.staticTexts["capture-draft-count"].firstMatch
        XCTAssertTrue(count.waitForExistence(timeout: 10))
        XCTAssertEqual(count.label, "1 item · 2 photos")
        app.buttons["Add a sample close-up"].firstMatch.tap()
        XCTAssertEqual(count.label, "1 item · 3 photos")
        XCTAssertFalse(app.navigationBars["Example photo batch"].exists)
        let identify = app.buttons["Identify 1 item"].firstMatch
        XCTAssertTrue(identify.isHittable)

        app.swipeUp()
        XCTAssertTrue(app.descendants(matching: .any)["replace-photo-1"].firstMatch.exists)
        XCTAssertFalse(app.descendants(matching: .any)["replace-photo-2"].exists)
        XCTAssertEqual(app.staticTexts["draft-photo-1"].firstMatch.label, "Front")
        XCTAssertEqual(app.staticTexts["draft-photo-2"].firstMatch.label, "Back")
        XCTAssertEqual(app.staticTexts["draft-photo-3"].firstMatch.label, "Detail")
        identify.tap()
        XCTAssertTrue(app.navigationBars["Example photo batch"].firstMatch.waitForExistence(timeout: 10))
    }

    @MainActor
    func testSignInAndSavedPhotoActionsAreVisible() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--preview-sign-in"]
        app.launch()

        let request = app.buttons["Send sign-in link"].firstMatch
        XCTAssertTrue(request.waitForExistence(timeout: 15))
        XCTAssertTrue(request.isHittable)
        XCTAssertTrue(app.buttons["Explore the demo"].firstMatch.isHittable)
        app.buttons["I already have a link"].firstMatch.tap()
        XCTAssertTrue(app.secureTextFields["Paste sign-in link"].firstMatch.waitForExistence(timeout: 10))
        let email = app.textFields["Email address"].firstMatch
        email.tap()
        email.typeText("collector@example.com\n")
        XCTAssertTrue(app.staticTexts["Check your email"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Open email"].firstMatch.exists)
        app.buttons["Paste sign-in link"].firstMatch.tap()
        XCTAssertTrue(app.secureTextFields["Paste sign-in link"].firstMatch.exists)
        app.buttons["Change email address"].firstMatch.tap()
        XCTAssertTrue(app.textFields["Email address"].firstMatch.waitForExistence(timeout: 10))

        app.terminate()
        app.launchArguments = ["--preview-photo-review"]
        app.launch()
        let openBatch = app.buttons["Open example photo batch"].firstMatch
        XCTAssertTrue(openBatch.waitForExistence(timeout: 15))
        openBatch.tap()
        XCTAssertTrue(app.staticTexts["1 added to your collection"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["Catalog manually"].exists)
        let viewRecord = app.buttons["View record"].firstMatch
        if !viewRecord.isHittable { app.swipeUp() }
        XCTAssertTrue(viewRecord.isHittable)
        viewRecord.tap()
        XCTAssertTrue(app.navigationBars["Bank of Canada one-dollar note"].firstMatch.waitForExistence(timeout: 10))
        app.navigationBars.buttons.firstMatch.tap()
        let uncertain = app.staticTexts["Review details"].firstMatch
        if !uncertain.isHittable { app.swipeUp() }
        XCTAssertTrue(uncertain.waitForExistence(timeout: 10))
    }
}

final class GuestV1Tests: XCTestCase {
    @MainActor
    func testCabinetScanSettingsAndInspection() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--guest-test-" + UUID().uuidString, "--guest-sales-fixture"]
        app.launch()
        let scan = app.buttons["cabinet-scan"].firstMatch
        XCTAssertTrue(scan.waitForExistence(timeout: 15))
        scan.tap()
        XCTAssertTrue(app.buttons["Import photos"].firstMatch.waitForExistence(timeout: 10))
        app.buttons["Close"].firstMatch.tap()
        let settings = app.tabBars.buttons["Settings"]
        settings.tap()
        XCTAssertTrue(app.buttons["Back up collection"].firstMatch.waitForExistence(timeout: 5))
        app.tabBars.buttons["Collection"].tap()
        let card = galleryCard("United States quarter", in: app)
        XCTAssertTrue(card.waitForExistence(timeout: 10))
        card.tap()
        let sales = app.buttons["guest-comparable-sales"]
        XCTAssertTrue(sales.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["guest-save-record"].exists)
        recordScreenshot("Cabinet iPhone specimen inspection", app)
        let edit = app.buttons["cabinet-edit-record"]
        reveal(edit, in: app)
        edit.tap()
        XCTAssertTrue(app.textFields["guest-field-year"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["guest-field-year"].value as? String, "1991")
        app.buttons["Done editing"].firstMatch.tap()
        XCTAssertTrue(edit.waitForExistence(timeout: 5))
    }

    @MainActor
    func testSwipeGalleryCardCancelsThenDeletesOnlyThatPiece() {
        continueAfterFailure = false
        let previousAppearance = XCUIDevice.shared.appearance
        XCUIDevice.shared.appearance = .light
        defer { XCUIDevice.shared.appearance = previousAppearance }
        let app = XCUIApplication()
        app.launchArguments = ["--guest-test-" + UUID().uuidString, "--guest-sales-fixture",
                               "-collector-list-view", "NO"]
        app.launch()
        let quarter = galleryCard("United States quarter", in: app)
        XCTAssertTrue(quarter.waitForExistence(timeout: 15))
        addManually("Keep this token", to: app, isBanknote: false)
        swipeWithinCard(quarter)
        let action = app.buttons["Delete"].firstMatch
        recordScreenshot("Swipe to delete – gallery", app)
        XCTAssertTrue(action.waitForExistence(timeout: 5), app.debugDescription)
        action.tap()
        let prompt = app.alerts.firstMatch
        XCTAssertTrue(prompt.staticTexts["Delete “United States quarter”?"].waitForExistence(timeout: 5))
        prompt.buttons["Cancel"].tap()
        XCTAssertTrue(quarter.isHittable)
        swipeWithinCard(quarter)
        action.tap()
        prompt.buttons["Delete"].tap()
        let removed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: quarter)
        XCTAssertEqual(XCTWaiter.wait(for: [removed], timeout: 5), .completed)
        app.terminate()
        app.launch()
        XCTAssertTrue(galleryCard("Keep this token", in: app).waitForExistence(timeout: 15))
        XCTAssertFalse(quarter.exists)
    }

    @MainActor
    private func swipeWithinCard(_ card: XCUIElement) {
        let start = card.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.5))
        let end = card.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.5))
        start.press(forDuration: 0.03, thenDragTo: end, withVelocity: .fast, thenHoldForDuration: 0)
    }

    @MainActor
    func testSwipeListRowWithAccessibilityText() {
        continueAfterFailure = false
        let previousAppearance = XCUIDevice.shared.appearance
        XCUIDevice.shared.appearance = .dark
        defer { XCUIDevice.shared.appearance = previousAppearance }
        let app = XCUIApplication()
        app.launchArguments = ["--guest-test-" + UUID().uuidString, "--guest-sales-fixture",
                               "-collector-list-view", "YES",
                               "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityM"]
        app.launch()
        let row = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "list-piece-")).firstMatch
        XCUIDevice.shared.appearance = .dark
        XCTAssertTrue(row.waitForExistence(timeout: 15))
        if !row.isHittable { app.swipeUp() }
        row.swipeLeft()
        let action = app.buttons["Delete"].firstMatch
        XCTAssertTrue(action.waitForExistence(timeout: 5))
        recordScreenshot("Swipe to delete – list with larger text", app)
        action.tap()
        let prompt = app.alerts.firstMatch
        XCTAssertTrue(prompt.staticTexts["Delete “United States quarter”?"].waitForExistence(timeout: 5))
        prompt.buttons["Delete"].tap()
        XCTAssertTrue(app.staticTexts["No pieces yet"].firstMatch.waitForExistence(timeout: 8))
    }

    @MainActor
    private func recordScreenshot(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    func testSecondOpinionCardUsesBothPhotosWithoutSigningIn() {
        let app = XCUIApplication()
        app.launchArguments = ["--guest-test-" + UUID().uuidString, "--guest-consent-fixture"]
        app.launch()
        let resume = app.buttons["Resume batch"].firstMatch
        XCTAssertTrue(resume.waitForExistence(timeout: 15))
        resume.tap()
        let open = app.buttons["Ask for a second opinion"].firstMatch
        XCTAssertTrue(open.waitForExistence(timeout: 10))
        open.tap()
        let card = app.images["opinion-card-preview"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 15))
        XCTAssertTrue(card.label.contains("2 specimen photos"))
        app.buttons["Engraving"].firstMatch.tap()
        XCTAssertTrue(card.exists)
        let share = app.buttons["Share card"].firstMatch
        XCTAssertTrue(share.isHittable)
        share.tap()
        XCTAssertTrue(app.otherElements["ActivityListView"].firstMatch.waitForExistence(timeout: 8)
                      || app.buttons["Copy"].firstMatch.exists || app.buttons["Save Image"].firstMatch.exists,
                      app.debugDescription)
    }

    @MainActor
    func testGuestSearchUsesInlineConsentAndFillsRecord() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--guest-test-" + UUID().uuidString, "--guest-consent-fixture"]
        app.launch()
        let resume = app.buttons["Resume batch"]
        XCTAssertTrue(resume.waitForExistence(timeout: 15), app.debugDescription)
        resume.tap()
        XCTAssertTrue(app.buttons["Zoom photo 1"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Zoom photo 2"].firstMatch.exists)
        let search = app.buttons["guest-search-online"]
        reveal(search, in: app)
        let disclosure = app.staticTexts["guest-online-disclosure"]
        XCTAssertTrue(disclosure.exists)
        XCTAssertTrue(disclosure.label.contains("both photos shown"))
        XCTAssertTrue(disclosure.label.contains("Cloudflare Workers AI"))
        XCTAssertNotEqual(app.textFields["guest-field-title"].value as? String, "2007 Jefferson nickel")
        search.tap()
        let title = app.textFields["guest-field-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10))
        XCTAssertEqual(title.value as? String, "2007 Jefferson nickel")
        XCTAssertEqual(app.textFields["guest-field-issuer"].value as? String, "Collector correction")
        XCTAssertEqual(app.textFields["guest-field-year"].value as? String, "2007")
        XCTAssertFalse(app.segmentedControls.buttons["Banknote"].exists)
        XCTAssertFalse(app.buttons["Send selected photos"].exists)
        XCTAssertEqual(app.buttons["guest-save-record"].label, "Save to collection")
    }

    @MainActor
    private func reveal(_ button: XCUIElement, in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let viewport = app.frame.insetBy(dx: 8, dy: 96)
        let lower = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.74))
        let upper = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.43))
        for _ in 0..<10 {
            if button.exists {
                let frame = button.frame
                if !frame.isEmpty && viewport.contains(CGPoint(x: frame.midX, y: frame.midY)) {
                    XCTAssertTrue(button.isEnabled, file: file, line: line)
                    return
                }
                if !frame.isEmpty && frame.midY < viewport.minY {
                    upper.press(forDuration: 0.05, thenDragTo: lower, withVelocity: .slow, thenHoldForDuration: 0.1)
                    continue
                }
            }
            lower.press(forDuration: 0.05, thenDragTo: upper, withVelocity: .slow, thenHoldForDuration: 0.1)
        }
        XCTFail("Could not scroll to \(button) in \(app.debugDescription)", file: file, line: line)
    }

    @MainActor
    func testGuestDraftPersistsAcrossRelaunchWithBothSides() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--guest-test-" + UUID().uuidString, "--guest-photo-fixtures"]
        app.launch()
        let start = app.buttons["Start scanning"]
        XCTAssertTrue(start.waitForExistence(timeout: 15))
        start.tap()
        let front = app.buttons["Add sample photo"]
        XCTAssertTrue(front.waitForExistence(timeout: 10))
        front.tap()
        XCTAssertTrue(app.buttons["Zoom photo 1"].firstMatch.waitForExistence(timeout: 10))
        app.terminate()
        app.launch()
        let resume = app.buttons["Resume batch"]
        XCTAssertTrue(resume.waitForExistence(timeout: 15))
        XCTAssertFalse(start.exists)
        resume.tap()
        XCTAssertTrue(app.buttons["Zoom photo 1"].firstMatch.waitForExistence(timeout: 10))
        let back = app.buttons["Add sample photo"]
        if !back.isHittable { app.swipeUp() }
        XCTAssertTrue(back.isHittable)
        back.tap()
        XCTAssertTrue(app.buttons["Zoom photo 2"].firstMatch.waitForExistence(timeout: 10))
        let save = app.buttons["guest-save-record"]
        for _ in 0..<8 where !save.isHittable { app.swipeUp() }
        XCTAssertTrue(save.isHittable)
        save.tap()
        XCTAssertTrue(galleryCard("Unidentified coin", in: app).waitForExistence(timeout: 10))
        XCTAssertFalse(resume.exists)

        addManually("Test banknote", to: app, isBanknote: true)
        addManually("Unknown piece", to: app, isBanknote: false)
        app.terminate()
        app.launch()
        XCTAssertTrue(galleryCard("Test banknote", in: app).waitForExistence(timeout: 15))
        XCTAssertTrue(galleryCard("Unknown piece", in: app).exists)
        XCTAssertTrue(galleryCard("Unidentified coin", in: app).exists)
        XCTAssertFalse(app.buttons["Send sign-in link"].exists)
        let search = app.searchFields.firstMatch
        if !search.isHittable { app.swipeDown() }
        XCTAssertTrue(search.isHittable)
        search.tap()
        search.typeText("banknote")
        XCTAssertTrue(galleryCard("Test banknote", in: app).waitForExistence(timeout: 10))
        XCTAssertFalse(galleryCard("Unknown piece", in: app).exists)
    }

    @MainActor
    func testEncryptedBackupAndSpreadsheetRoundTrip() {
        let app = XCUIApplication()
        app.launchArguments = ["--guest-storage-acceptance"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Guest storage checks passed"].waitForExistence(timeout: 20), app.debugDescription)
    }

    @MainActor
    private func galleryCard(_ title: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label == %@", "gallery-piece-", title)).firstMatch
    }

    @MainActor
    private func addManually(_ title: String, to app: XCUIApplication, isBanknote: Bool) {
        app.buttons["Add item"].tap()
        app.buttons["Enter details manually"].tap()
        let editor = app.scrollViews["guest-record-scroll"].firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 10))
        if isBanknote {
            let banknote = editor.segmentedControls.buttons["Banknote"].firstMatch
            for _ in 0..<5 where !banknote.isHittable { editor.swipeUp() }
            XCTAssertTrue(banknote.isHittable, app.debugDescription)
            banknote.tap()
        }
        let field = app.textFields["guest-field-title"]
        for _ in 0..<5 where !field.isHittable { editor.swipeUp() }
        XCTAssertTrue(field.isHittable)
        let save = app.buttons["guest-save-record"]
        field.tap()
        field.typeText(title)
        for _ in 0..<5 where !save.isHittable { app.swipeUp() }
        XCTAssertTrue(save.isHittable)
        save.tap()
        XCTAssertTrue(galleryCard(title, in: app).waitForExistence(timeout: 10))
    }
}
