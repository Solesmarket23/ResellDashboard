import Foundation
import SwiftUI
import AuthenticationServices
import CoreData

class AuthenticationManager: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: User?
    @Published var hasCompletedOnboarding = false
    
    private let viewContext = PersistenceController.shared.container.viewContext
    
    init() {
        checkAuthenticationStatus()
    }
    
    private func checkAuthenticationStatus() {
        if let userId = UserDefaults.standard.string(forKey: "currentUserId") {
            fetchUser(withId: userId)
        }
    }
    
    private func fetchUser(withId id: String) {
        let request: NSFetchRequest<User> = User.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", id as CVarArg)
        request.fetchLimit = 1
        
        do {
            let users = try viewContext.fetch(request)
            if let user = users.first {
                self.currentUser = user
                self.isAuthenticated = true
                self.hasCompletedOnboarding = user.hasCompletedOnboarding
            }
        } catch {
            print("Error fetching user: \(error)")
        }
    }
    
    func signInWithApple(authorization: ASAuthorization) {
        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            return
        }
        
        let userId = appleIDCredential.user
        let email = appleIDCredential.email
        let fullName = appleIDCredential.fullName
        
        // Check if user exists
        let request: NSFetchRequest<User> = User.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", userId as CVarArg)
        request.fetchLimit = 1
        
        do {
            let users = try viewContext.fetch(request)
            let user: User
            
            if let existingUser = users.first {
                user = existingUser
            } else {
                // Create new user
                user = User(context: viewContext)
                user.id = UUID(uuidString: userId) ?? UUID()
                user.createdAt = Date()
                user.referralCode = generateReferralCode()
            }
            
            // Update user info if available
            if let email = email {
                user.email = email
            }
            
            if let fullName = fullName {
                let name = "\(fullName.givenName ?? "") \(fullName.familyName ?? "")".trimmingCharacters(in: .whitespaces)
                if !name.isEmpty {
                    user.name = name
                }
            }
            
            user.lastActiveDate = Date()
            
            try viewContext.save()
            
            // Update local state
            UserDefaults.standard.set(userId, forKey: "currentUserId")
            self.currentUser = user
            self.isAuthenticated = true
            self.hasCompletedOnboarding = user.hasCompletedOnboarding
            
        } catch {
            print("Error saving user: \(error)")
        }
    }
    
    func signOut() {
        UserDefaults.standard.removeObject(forKey: "currentUserId")
        currentUser = nil
        isAuthenticated = false
        hasCompletedOnboarding = false
    }
    
    func completeOnboarding() {
        guard let user = currentUser else { return }
        
        user.hasCompletedOnboarding = true
        
        do {
            try viewContext.save()
            hasCompletedOnboarding = true
        } catch {
            print("Error updating onboarding status: \(error)")
        }
    }
    
    func updatePremiumStatus(_ isPremium: Bool, expiryDate: Date? = nil) {
        guard let user = currentUser else { return }
        
        user.isPremium = isPremium
        user.subscriptionExpiryDate = expiryDate
        
        do {
            try viewContext.save()
        } catch {
            print("Error updating premium status: \(error)")
        }
    }
    
    private func generateReferralCode() -> String {
        let letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        let numbers = "0123456789"
        
        var code = ""
        for _ in 0..<3 {
            code += String(letters.randomElement()!)
        }
        code += "-"
        for _ in 0..<3 {
            code += String(numbers.randomElement()!)
        }
        
        return code
    }
}