import XCTest

final class TabletWorkspaceTests: XCTestCase {
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
    func testGuestConsentStartsEmptyAndCanBeDeclined() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--guest-test-" + UUID().uuidString, "--guest-photo-fixtures"]
        app.launch()
        let start = app.buttons["Start scanning"]
        XCTAssertTrue(start.waitForExistence(timeout: 15))
        start.tap()
        let front = app.buttons["Use sample front"]
        XCTAssertTrue(front.waitForExistence(timeout: 10))
        front.tap()
        let back = app.buttons["Use sample back"]
        for _ in 0..<5 where !back.isHittable { app.swipeUp() }
        XCTAssertTrue(back.isHittable)
        back.tap()
        let search = app.buttons["Search online"]
        for _ in 0..<6 where !search.isHittable { app.swipeUp() }
        XCTAssertTrue(search.isHittable)
        search.tap()
        let send = app.buttons["Send selected photos"]
        XCTAssertTrue(send.waitForExistence(timeout: 10))
        XCTAssertFalse(send.isEnabled)
        let backChoice = app.buttons["guest-online-back"]
        XCTAssertTrue(backChoice.isHittable)
        backChoice.tap()
        XCTAssertTrue(app.staticTexts["1 selected"].waitForExistence(timeout: 10))
        XCTAssertTrue(send.isEnabled)
        app.buttons["Keep on this iPhone"].tap()
        XCTAssertTrue(search.waitForExistence(timeout: 10))
        search.tap()
        XCTAssertTrue(send.waitForExistence(timeout: 10))
        XCTAssertFalse(send.isEnabled)
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
        let front = app.buttons["Use sample front"]
        XCTAssertTrue(front.waitForExistence(timeout: 10))
        front.tap()
        XCTAssertTrue(app.images["Front photo"].firstMatch.waitForExistence(timeout: 10))
        app.terminate()
        app.launch()
        let resume = app.buttons["Resume batch"]
        XCTAssertTrue(resume.waitForExistence(timeout: 15))
        XCTAssertFalse(start.exists)
        resume.tap()
        XCTAssertTrue(app.images["Front photo"].firstMatch.waitForExistence(timeout: 10))
        let back = app.buttons["Use sample back"]
        if !back.isHittable { app.swipeUp() }
        XCTAssertTrue(back.isHittable)
        back.tap()
        XCTAssertTrue(app.images["Back photo"].firstMatch.waitForExistence(timeout: 10))
        let save = app.buttons["Save as unidentified"]
        for _ in 0..<8 where !save.isHittable { app.swipeUp() }
        XCTAssertTrue(save.isHittable)
        save.tap()
        XCTAssertTrue(app.staticTexts["Unidentified coin"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(resume.exists)

        addManually("Test banknote", to: app, isBanknote: true)
        addManually("Unknown piece", to: app, isBanknote: false)
        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["Test banknote"].firstMatch.waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Unknown piece"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts["Unidentified coin"].firstMatch.exists)
        XCTAssertFalse(app.buttons["Send sign-in link"].exists)
        let search = app.searchFields.firstMatch
        if !search.isHittable { app.swipeDown() }
        XCTAssertTrue(search.isHittable)
        search.tap()
        search.typeText("banknote")
        XCTAssertTrue(app.staticTexts["Test banknote"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["Unknown piece"].firstMatch.exists)
    }

    @MainActor
    func testEncryptedBackupAndSpreadsheetRoundTrip() {
        let app = XCUIApplication()
        app.launchArguments = ["--guest-storage-acceptance"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Guest storage checks passed"].waitForExistence(timeout: 20), app.debugDescription)
    }

    @MainActor
    private func addManually(_ title: String, to app: XCUIApplication, isBanknote: Bool) {
        app.buttons["Add item"].tap()
        app.buttons["Enter details manually"].tap()
        let field = app.textFields["Title"]
        for _ in 0..<5 where !field.isHittable { app.swipeUp() }
        XCTAssertTrue(field.isHittable)
        let save = app.buttons["Save as unidentified"]
        if isBanknote {
            let banknote = app.segmentedControls.buttons["Banknote"].firstMatch
            if !banknote.isHittable { app.swipeDown() }
            XCTAssertTrue(banknote.isHittable, app.debugDescription)
            banknote.tap()
        }
        field.tap()
        field.typeText(title)
        for _ in 0..<5 where !save.isHittable { app.swipeUp() }
        XCTAssertTrue(save.isHittable)
        save.tap()
        XCTAssertTrue(app.staticTexts[title].firstMatch.waitForExistence(timeout: 10))
    }
}
