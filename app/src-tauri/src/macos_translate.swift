import Foundation
import NaturalLanguage
import Translation

struct TranslateRequest: Decodable {
    let text: String
    let targetLanguage: String
}

struct TranslateResponse: Encodable {
    let sourceLanguage: String
    let targetLanguage: String
    let sourceText: String
    let targetText: String
}

struct TranslateErrorResponse: Encodable {
    let error: String
}

func writeJson<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    if let data = try? encoder.encode(value) {
        FileHandle.standardOutput.write(data)
    }
}

func fail(_ message: String, code: Int32 = 1) -> Never {
    writeJson(TranslateErrorResponse(error: message))
    exit(code)
}

@available(macOS 15.0, *)
func statusName(_ status: LanguageAvailability.Status) -> String {
    switch status {
    case .installed:
        return "installed"
    case .supported:
        return "supported"
    case .unsupported:
        return "unsupported"
    @unknown default:
        return "unknown"
    }
}

@main
struct DevLauncherTranslateHelper {
    static func main() async {
        guard #available(macOS 15.0, *) else {
            fail("macOS system translation requires macOS 15 or later")
        }

        let input = FileHandle.standardInput.readDataToEndOfFile()
        guard !input.isEmpty else {
            fail("missing translation request")
        }

        let request: TranslateRequest
        do {
            request = try JSONDecoder().decode(TranslateRequest.self, from: input)
        } catch {
            fail("invalid translation request: \(error.localizedDescription)")
        }

        let text = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            fail("nothing to translate")
        }

        let recognizer = NLLanguageRecognizer()
        recognizer.processString(text)
        guard let detectedLanguage = recognizer.dominantLanguage else {
            fail("unable to identify source language")
        }

        let source = Locale.Language(identifier: detectedLanguage.rawValue)
        let target = Locale.Language(identifier: request.targetLanguage)
        do {
            let availability = LanguageAvailability()
            let status = await availability.status(from: source, to: target)
            switch status {
            case .installed:
                break
            case .supported:
                fail("LANGUAGE_PACK_REQUIRED:\(source.minimalIdentifier)->\(target.minimalIdentifier)")
            case .unsupported:
                fail("UNSUPPORTED_LANGUAGE_PAIR:\(source.minimalIdentifier)->\(target.minimalIdentifier)")
            @unknown default:
                fail("TRANSLATION_STATUS_UNKNOWN:\(source.minimalIdentifier)->\(target.minimalIdentifier)")
            }
            let session = TranslationSession(installedSource: source, target: target)
            try await session.prepareTranslation()
            let response = try await session.translate(text)
            writeJson(TranslateResponse(
                sourceLanguage: response.sourceLanguage.minimalIdentifier,
                targetLanguage: response.targetLanguage.minimalIdentifier,
                sourceText: response.sourceText,
                targetText: response.targetText
            ))
        } catch {
            fail(error.localizedDescription)
        }
    }
}
