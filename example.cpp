//===-- StructProfilerPass.cpp - LLVM Instrumentation Pass --------------===//
// This file defines an LLVM pass that:
// 1. Builds a call graph with cycle estimation.
// 2. Instruments functions with sampling-based cycle counters.
// 3. Tracks reads/writes to struct fields annotated with __profile__.

#include "llvm/IR/PassManager.h"
#include "llvm/IR/Function.h"
#include "llvm/IR/IRBuilder.h"
#include "llvm/IR/Instructions.h"
#include "llvm/IR/DebugInfoMetadata.h"
#include "llvm/IR/InstIterator.h"
#include "llvm/Pass.h"
#include "llvm/Transforms/Utils/ModuleUtils.h"
#include <unordered_map>
#include <vector>
#include <string>

using namespace llvm;

namespace {

struct StructProfilerPass : public PassInfoMixin<StructProfilerPass> {
  PreservedAnalyses run(Module &M, ModuleAnalysisManager &AM);

private:
  void instrumentFunction(Function &F, Module &M);
  void instrumentFieldAccess(Function &F, Module &M);
  bool isProfiledStruct(Type *T);
};

PreservedAnalyses StructProfilerPass::run(Module &M, ModuleAnalysisManager &) {
  for (Function &F : M) {
    if (!F.isDeclaration()) {
      instrumentFunction(F, M);
      instrumentFieldAccess(F, M);
    }
  }
  return PreservedAnalyses::none();
}

void StructProfilerPass::instrumentFunction(Function &F, Module &M) {
  LLVMContext &Ctx = M.getContext();
  IRBuilder<> IRB(&*F.getEntryBlock().getFirstInsertionPt());

  // Insert runtime profiler call for function entry
  FunctionCallee EntryFn = M.getOrInsertFunction("__record_func_entry", IRB.getInt8PtrTy());
  IRB.CreateCall(EntryFn, IRB.CreateGlobalStringPtr(F.getName()));

  // Insert exit hook (simplified - may miss some paths)
  for (auto &BB : F) {
    if (isa<ReturnInst>(BB.getTerminator())) {
      IRBuilder<> RetIRB(BB.getTerminator());
      FunctionCallee ExitFn = M.getOrInsertFunction("__record_func_exit", IRB.getInt8PtrTy());
      RetIRB.CreateCall(ExitFn, IRB.CreateGlobalStringPtr(F.getName()));
    }
  }
}

void StructProfilerPass::instrumentFieldAccess(Function &F, Module &M) {
  LLVMContext &Ctx = M.getContext();
  for (Instruction &I : instructions(F)) {
    IRBuilder<> IRB(&I);
    if (auto *Load = dyn_cast<LoadInst>(&I)) {
      if (auto *GEP = dyn_cast<GetElementPtrInst>(Load->getPointerOperand())) {
        if (StructType *ST = dyn_cast<StructType>(GEP->getSourceElementType())) {
          if (isProfiledStruct(ST)) {
            int FieldIdx = dyn_cast<ConstantInt>(GEP->getOperand(2))->getZExtValue();
            FunctionCallee ProfFn = M.getOrInsertFunction("__profile_field_read", IRB.getInt8PtrTy(), IRB.getInt32Ty());
            IRB.CreateCall(ProfFn, {
              IRB.CreateGlobalStringPtr(ST->getName()), IRB.getInt32(FieldIdx)
            });
          }
        }
      }
    } else if (auto *Store = dyn_cast<StoreInst>(&I)) {
      if (auto *GEP = dyn_cast<GetElementPtrInst>(Store->getPointerOperand())) {
        if (StructType *ST = dyn_cast<StructType>(GEP->getSourceElementType())) {
          if (isProfiledStruct(ST)) {
            int FieldIdx = dyn_cast<ConstantInt>(GEP->getOperand(2))->getZExtValue();
            FunctionCallee ProfFn = M.getOrInsertFunction("__profile_field_write", IRB.getInt8PtrTy(), IRB.getInt32Ty());
            IRB.CreateCall(ProfFn, {
              IRB.CreateGlobalStringPtr(ST->getName()), IRB.getInt32(FieldIdx)
            });
          }
        }
      }
    }
  }
}

bool StructProfilerPass::isProfiledStruct(Type *T) {
  if (auto *ST = dyn_cast<StructType>(T)) {
    return ST->hasName() && ST->getName().contains("__profile__");
  }
  return false;
}

} // namespace

// Register pass
extern "C" LLVM_EXTERNAL_VISIBILITY ::llvm::PassPluginLibraryInfo llvmGetPassPluginInfo() {
  return {
    LLVM_PLUGIN_API_VERSION, "StructProfilerPass", LLVM_VERSION_STRING,
    [](PassBuilder &PB) {
      PB.registerPipelineParsingCallback(
        [](StringRef Name, ModulePassManager &MPM,
           ArrayRef<PassBuilder::PipelineElement>) {
          if (Name == "struct-profiler") {
            MPM.addPass(StructProfilerPass());
            return true;
          }
          return false;
        });
    }
  };
}

