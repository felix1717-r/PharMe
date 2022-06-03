import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:http/http.dart';

import '../../common/module.dart';

part 'cubit.freezed.dart';

class ReportsCubit extends Cubit<ReportsState> {
  ReportsCubit() : super(ReportsState.initial()) {
    loadMedications();
  }

  Future<void> loadMedications() async {
    final requestUri = annotationServerUrl.replace(
      path: 'api/v1/medications',
      queryParameters: {'withGuidelines': 'true'},
    );
    emit(ReportsState.loading());
    final response = await get(requestUri);
    if (response.statusCode != 200) {
      emit(ReportsState.error());
      return;
    }
    final medications = medicationsWithGuidelinesFromHTTPResponse(response);
    emit(ReportsState.loaded(medications));
  }
}

@freezed
class ReportsState with _$ReportsState {
  const factory ReportsState.initial() = _InitialState;
  const factory ReportsState.loading() = _LoadingState;
  const factory ReportsState.loaded(
    List<MedicationWithGuidelines> medications,
  ) = _LoadedState;
  const factory ReportsState.error() = _ErrorState;
}
